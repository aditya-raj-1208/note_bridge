import { NextResponse } from "next/server";
import { extractLecturePages, extractPages, MAX_TEXTBOOK_PAGES, readPdfUpload, UserFacingError } from "@/lib/pdf";
import { extractLectureItems, MAX_TOPICS } from "@/lib/topics";
import { buildQuestionBank, findQuestions } from "@/lib/questions";
import { normalizeForCompare } from "@/lib/text";
import { buildIndex } from "@/lib/search";
import { judgeItem } from "@/lib/coverage";
import { validateCitations } from "@/lib/validate";
import { llmStatus } from "@/lib/llm";
import type { AnalysisResult, MappedItem } from "@/lib/types";

// Runs on the default Node.js runtime. Uploaded PDFs are processed in memory only and never persisted.
export async function POST(request: Request) {
  try {
    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      throw new UserFacingError("Expected a multipart/form-data upload with lecturePdf and textbookPdf.");
    }
    const lecture = await readPdfUpload(form.get("lecturePdf"), "Lecture PDF");
    const textbook = await readPdfUpload(form.get("textbookPdf"), "Textbook PDF");

    // Validate the textbook first so a bad textbook doesn't waste OCR quota.
    const textbookPages = await extractPages(textbook.bytes, "Textbook PDF", textbook.name, MAX_TEXTBOOK_PAGES);
    const lectureExtract = await extractLecturePages(lecture.bytes, lecture.name);
    const lecturePages = lectureExtract.pages;

    const warnings: string[] = [llmStatus().warning, ...lectureExtract.warnings];
    const { items: lectureItems, totalFound } = extractLectureItems(lecturePages);
    if (lectureItems.length === 0) {
      warnings.push("No topics could be identified in the lecture PDF.");
    } else if (totalFound > lectureItems.length) {
      warnings.push(`Showing ${lectureItems.length} of ${totalFound} topics found (limited to ${MAX_TOPICS}, spread across lecture pages).`);
    }

    const index = buildIndex(textbookPages);
    const bank = buildQuestionBank(textbookPages);
    const usedQuestions = new Set<string>();
    const pageText = new Map(textbookPages.map((p) => [p.pdfPage, normalizeForCompare(p.text)]));
    let droppedTotal = 0;
    const items: MappedItem[] = lectureItems.map((li) => {
      const { mapped, candidates } = judgeItem(index, li);
      const { item, dropped } = validateCitations(mapped, candidates.map((c) => c.page), lecturePages.length);
      droppedTotal += dropped;
      if (item.status === "covered" || item.status === "partially_covered") {
        // Questions are verbatim book text; verify each really appears on its textbook page before showing it.
        item.questions = findQuestions(index, bank, li.queryText, usedQuestions).filter((q) =>
          pageText.get(q.pdfPage)?.includes(normalizeForCompare(q.text))
        );
      }
      return item;
    });
    if (droppedTotal > 0) warnings.push(`${droppedTotal} citation(s) failed verification and were removed.`);

    const result: AnalysisResult = {
      lectureFilename: lecture.name,
      textbookFilename: textbook.name,
      lecturePageCount: lecturePages.length,
      textbookPageCount: textbookPages.length,
      items,
      warnings,
      mode: "keyword-fallback",
      lectureOcrPages: lectureExtract.ocrPages,
    };
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof UserFacingError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("Analysis failed:", err instanceof Error ? err.message : "unknown error");
    return NextResponse.json({ error: "Something went wrong while analysing the PDFs. Please try again." }, { status: 500 });
  }
}
