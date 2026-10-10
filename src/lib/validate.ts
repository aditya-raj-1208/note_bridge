// Citation validation: every citation must point to a retrieved candidate page and its quote
// must appear verbatim (after whitespace/quote normalization) in that page's extracted text.
import type { MappedItem, PdfPage } from "./types";
import { normalizeForCompare } from "./text";

export function validateCitations(
  item: MappedItem,
  candidatePages: PdfPage[],
  lecturePageCount: number
): { item: MappedItem; dropped: number } {
  const byPage = new Map(candidatePages.map((p) => [p.pdfPage, normalizeForCompare(p.text)]));
  const valid = item.matches.filter((m) => {
    const pageText = byPage.get(m.pdfPage);
    if (!pageText) return false; // not among retrieved candidates
    const quote = normalizeForCompare(m.evidenceQuote);
    return quote.length > 0 && pageText.includes(quote);
  });
  const dropped = item.matches.length - valid.length;
  const lecturePdfPages = item.lecturePdfPages.filter((p) => Number.isInteger(p) && p >= 1 && p <= lecturePageCount).slice(0, 3);
  valid.splice(3); // never recommend more than 3 textbook pages per item

  let { status, gapNote, confidence } = item;
  if (valid.length === 0 && (status === "covered" || status === "partially_covered")) {
    status = "uncertain";
    confidence = "low";
    gapNote = "Citations could not be verified against the extracted textbook text, so they were removed.";
  }
  return { item: { ...item, matches: valid, lecturePdfPages, status, gapNote, confidence }, dropped };
}
