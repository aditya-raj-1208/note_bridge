export type CoverageStatus = "covered" | "partially_covered" | "not_located" | "uncertain";
export type ItemType = "concept" | "example" | "derivation" | "definition" | "formula";

export interface PdfPage {
  pdfPage: number; // 1-based PDF page number
  text: string;
  source?: "text" | "ocr"; // "ocr" = transcribed by Gemini (may contain errors)
}

export interface TextbookMatch {
  pdfPage: number; // 1-based PDF page number, not printed page number
  evidenceQuote: string; // verbatim from extracted page text
  coverageNote: string;
}

/** A practice question copied verbatim from a real extracted textbook page (no answer provided). */
export interface BookQuestion {
  pdfPage: number; // textbook PDF page
  text: string;
}

export interface MappedItem {
  questions?: BookQuestion[];
  id: string;
  topic: string;
  subtopic?: string;
  itemType: ItemType;
  lecturePdfPages: number[];
  status: CoverageStatus;
  matches: TextbookMatch[];
  gapNote?: string;
  confidence: "high" | "medium" | "low";
}

export interface AnalysisResult {
  lectureFilename: string;
  textbookFilename: string;
  lecturePageCount: number;
  textbookPageCount: number;
  items: MappedItem[];
  warnings: string[];
  mode: "llm" | "keyword-fallback";
  lectureOcrPages: number[]; // lecture PDF pages whose text came from Gemini OCR
}

/** A lecture item before textbook matching. */
export interface LectureItem {
  id: string;
  topic: string;
  subtopic?: string;
  itemType: ItemType;
  lecturePdfPages: number[];
  queryText: string; // text used for keyword search
}
