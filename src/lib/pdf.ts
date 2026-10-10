import { getDocumentProxy } from "unpdf";
import { PDFDocument } from "pdf-lib";
import type { PdfPage } from "./types";
import { geminiOcrStatus, getGeminiApiKey, getOcrModel, OCR_TOTAL_BUDGET_MS, OcrError, ocrPdfPage } from "./ocr";

export const MAX_FILE_BYTES = 20 * 1024 * 1024; // 20 MB
export const MAX_LECTURE_PAGES = 100;
export const MAX_TEXTBOOK_PAGES = 1000; // raised from 500: real textbooks (e.g. the 846-page fluid mechanics book) exceed 500
const MAX_OCR_PAGES = 20; // per upload, to respect Gemini free-tier limits
const OCR_CONCURRENCY = 1; // sequential: free-tier per-minute limits are low (verified: 2 parallel requests hit 429 on a 10-page PDF)
const OCR_PAGE_GAP_MS = Number(process.env.GEMINI_OCR_PAGE_GAP_MS ?? 1500); // spacing between OCR requests
const MIN_TOTAL_CHARS = 80;
const MIN_CHARS_PER_PAGE = 20;

export class UserFacingError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

/** Validates an uploaded file (extension, size, %PDF- signature) and returns its bytes. */
export async function readPdfUpload(value: FormDataEntryValue | null, label: string): Promise<{ name: string; bytes: Uint8Array }> {
  if (!value || typeof value === "string") {
    throw new UserFacingError(`${label} is missing. Please select a PDF file.`);
  }
  const file = value as File;
  const name = file.name || `${label}.pdf`;
  if (!name.toLowerCase().endsWith(".pdf")) {
    throw new UserFacingError(`${label} "${name}" is not a PDF. Only .pdf files are supported (no PPT, Word or images).`);
  }
  if (file.size === 0) throw new UserFacingError(`${label} "${name}" is empty.`);
  if (file.size > MAX_FILE_BYTES) {
    throw new UserFacingError(`${label} "${name}" is larger than 20 MB. Please upload a smaller PDF.`, 413);
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  const header = new TextDecoder("latin1").decode(bytes.slice(0, 1024));
  if (!header.includes("%PDF-")) {
    throw new UserFacingError(`${label} "${name}" does not look like a valid PDF file (missing PDF signature).`);
  }
  return { name, bytes };
}

function hasEnoughText(pages: PdfPage[]): boolean {
  const total = pages.reduce((n, p) => n + p.text.length, 0);
  const textPages = pages.filter((p) => p.text.length >= MIN_CHARS_PER_PAGE).length;
  return total >= MIN_TOTAL_CHARS && textPages >= Math.max(1, Math.floor(pages.length * 0.2));
}

/** Searchable-PDF extraction (used for the textbook). Rejects scanned/image-only PDFs. */
export async function extractPages(bytes: Uint8Array, label: string, name: string, maxPages: number): Promise<PdfPage[]> {
  const pages = await extractPageTexts(bytes, label, name, maxPages);
  if (!hasEnoughText(pages)) {
    throw new UserFacingError(
      `${label} "${name}" contains too little extractable text. It may be scanned or image-only. Textbook PDFs must be searchable (text-based); OCR is only applied to lecture PDFs.`,
      422
    );
  }
  return pages;
}

/** Lecture extraction: normal text for searchable pages, Gemini OCR only for pages with too little text. */
export async function extractLecturePages(
  bytes: Uint8Array,
  name: string
): Promise<{ pages: PdfPage[]; ocrPages: number[]; unreadablePages: number[]; warnings: string[] }> {
  const label = "Lecture PDF";
  const pages = await extractPageTexts(bytes, label, name, MAX_LECTURE_PAGES);
  const needOcr = pages.filter((p) => p.text.length < MIN_CHARS_PER_PAGE).map((p) => p.pdfPage);
  if (needOcr.length === 0) return { pages, ocrPages: [], unreadablePages: [], warnings: [] };

  if (!getGeminiApiKey()) {
    if (hasEnoughText(pages)) {
      // Mostly digital PDF: keep going with the text we have, but say which pages were skipped.
      return {
        pages,
        ocrPages: [],
        unreadablePages: needOcr,
        warnings: [`Lecture PDF pages ${needOcr.join(", ")} look scanned/handwritten but were skipped: ${geminiOcrStatus().message}`],
      };
    }
    throw new UserFacingError(
      `Lecture PDF "${name}" appears to be scanned or handwritten (pages ${needOcr.join(", ")} have no extractable text), so it needs OCR. ${geminiOcrStatus().message}`,
      422
    );
  }
  if (needOcr.length > MAX_OCR_PAGES) {
    throw new UserFacingError(
      `Lecture PDF "${name}" has ${needOcr.length} scanned/handwritten pages; OCR is limited to ${MAX_OCR_PAGES} pages per upload to stay within Gemini free-tier limits.`,
      413
    );
  }

  const src = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const results = new Map<number, { text: string | null; note?: string }>();
  const deadline = Date.now() + OCR_TOTAL_BUDGET_MS;
  console.info(`[ocr] ${needOcr.length} lecture page(s) need OCR with ${getOcrModel()}`);
  try {
    for (let i = 0; i < needOcr.length; i += OCR_CONCURRENCY) {
      if (i > 0 && OCR_PAGE_GAP_MS > 0) await new Promise((r) => setTimeout(r, OCR_PAGE_GAP_MS));
      const batch = needOcr.slice(i, i + OCR_CONCURRENCY);
      const out = await Promise.all(
        batch.map(async (pageNo) => {
          const single = await PDFDocument.create();
          const [copied] = await single.copyPages(src, [pageNo - 1]);
          single.addPage(copied);
          return [pageNo, await ocrPdfPage(await single.save(), pageNo, deadline)] as const;
        })
      );
      for (const [pageNo, r] of out) results.set(pageNo, r);
    }
  } catch (e) {
    if (e instanceof OcrError) throw new UserFacingError(`OCR failed for lecture PDF "${name}": ${e.message}`, e.status);
    throw e;
  }

  const unreadablePages: number[] = [];
  const notes: string[] = [];
  const merged = pages.map((p) => {
    const r = results.get(p.pdfPage);
    if (!r) return { ...p, source: "text" as const };
    if (r.text) {
      if (r.note) notes.push(`page ${p.pdfPage}: ${r.note}`);
      return { pdfPage: p.pdfPage, text: r.text, source: "ocr" as const };
    }
    unreadablePages.push(p.pdfPage);
    notes.push(`page ${p.pdfPage}: ${r.note ?? "no readable text"}`);
    return { ...p, source: "text" as const }; // keep the (near-empty) original text, never fabricate
  });
  const ocrPages = needOcr.filter((n) => !unreadablePages.includes(n));

  if (!hasEnoughText(merged) || ocrPages.length === 0) {
    throw new UserFacingError(
      `OCR could not read enough text from lecture PDF "${name}" (${notes.join("; ") || "no readable text"}). Try a clearer scan.`,
      422
    );
  }
  const warnings = [
    `Lecture PDF pages ${ocrPages.join(", ")} were transcribed by Gemini OCR (${getOcrModel()}). OCR of handwriting and equations can contain errors; check important items against your notes.`,
  ];
  if (notes.length) warnings.push(`OCR notes: ${notes.join("; ")}.`);
  return { pages: merged, ocrPages, unreadablePages, warnings };
}

/** Extracts text page-by-page, preserving 1-based PDF page numbers (no text-amount validation). */
async function extractPageTexts(bytes: Uint8Array, label: string, name: string, maxPages: number): Promise<PdfPage[]> {
  let pdf;
  try {
    // pdf.js transfers (detaches) the buffer it is given, so pass a copy; the original is still needed for OCR page splitting.
    pdf = await getDocumentProxy(bytes.slice());
  } catch {
    throw new UserFacingError(`Could not open ${label} "${name}". The PDF may be corrupted or password-protected.`, 422);
  }
  if (pdf.numPages > maxPages) {
    throw new UserFacingError(`${label} "${name}" has ${pdf.numPages} pages; this demo supports at most ${maxPages}.`, 413);
  }
  const pages: PdfPage[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    let lastY: number | null = null;
    let text = "";
    for (const item of content.items) {
      if (!("str" in item)) continue;
      const y = item.transform[5];
      if (lastY !== null && Math.abs(y - lastY) > 2 && !text.endsWith("\n")) text += "\n";
      text += item.str;
      if (item.hasEOL) text += "\n";
      lastY = y;
    }
    pages.push({ pdfPage: i, text: text.replace(/[ \t]+/g, " ").replace(/\n\s*\n+/g, "\n").trim() });
  }
  return pages;
}
