// Keyword-fallback coverage judgement. Clearly NOT an AI judgement: it is based purely on
// term overlap between the lecture item and the retrieved textbook pages.
import type { CoverageStatus, LectureItem, MappedItem, TextbookMatch } from "./types";
import { type Candidate, type PageIndex, idf, searchPages } from "./search";
import { splitSentences, tokenize } from "./text";

const MAX_MATCHES = 3; // hard cap: never recommend more than 3 textbook pages per topic/subtopic

function bestSentence(index: PageIndex, candidate: Candidate, query: string): { quote: string; coverage: number } | null {
  const qTerms = [...new Set(tokenize(query))];
  const total = qTerms.reduce((a, t) => a + idf(index, t), 0);
  let best: { quote: string; coverage: number } | null = null;
  for (const s of splitSentences(candidate.page.text)) {
    const sTerms = new Set(tokenize(s));
    const matched = qTerms.reduce((a, t) => a + (sTerms.has(t) ? idf(index, t) : 0), 0);
    const cov = total ? matched / total : 0;
    if (cov > 0 && (!best || cov > best.coverage)) best = { quote: s.length > 300 ? s.slice(0, 300) : s, coverage: cov };
  }
  return best;
}

function statusFrom(pageCov: number, sentCov: number): CoverageStatus {
  if (pageCov >= 0.7 && sentCov >= 0.4) return "covered";
  if (pageCov >= 0.45) return "partially_covered";
  if (pageCov >= 0.25) return "uncertain";
  return "not_located";
}

export interface CandidateSet {
  item: LectureItem;
  candidates: Candidate[];
}

export function judgeItem(index: PageIndex, item: LectureItem): { mapped: MappedItem; candidates: Candidate[] } {
  const context = item.subtopic ? item.topic : "";
  const candidates = searchPages(index, item.queryText, context, 5);

  const scored = candidates
    .map((c) => ({ c, s: bestSentence(index, c, item.queryText) }))
    .filter((x) => x.s !== null) as { c: Candidate; s: { quote: string; coverage: number } }[];

  const top = scored[0];
  const status: CoverageStatus = top ? statusFrom(top.c.coverage, top.s.coverage) : "not_located";

  const matches: TextbookMatch[] =
    status === "not_located"
      ? []
      : scored
          .filter((x, i) => {
            const s = statusFrom(x.c.coverage, x.s.coverage);
            // top candidate may be weak (shown as uncertain); extra citations must be at least partial
            return i === 0 ? s !== "not_located" : s === "covered" || s === "partially_covered";
          })
          .slice(0, MAX_MATCHES)
          .map((x) => ({
            pdfPage: x.c.page.pdfPage,
            evidenceQuote: x.s.quote,
            coverageNote: `Keyword overlap: ${Math.round(x.c.coverage * 100)}% of the item's key terms appear on this page.`,
          }));

  const isExtra = item.itemType === "example" || item.itemType === "derivation";
  let gapNote: string | undefined;
  if (status === "not_located") {
    gapNote = isExtra
      ? `This ${item.itemType} was not located among the top textbook candidates — possibly extra lecture material (keyword search may miss reworded content).`
      : "No adequate keyword evidence found in the textbook. This does not prove the book omits it.";
  } else if (status === "uncertain") {
    gapNote = "Only weak keyword overlap found; check the cited pages manually.";
  } else if (status === "partially_covered") {
    gapNote = isExtra
      ? `Related material found, but this specific ${item.itemType} may not appear in the book.`
      : "Some key terms found; the book may cover this only partly.";
  }

  const confidence = status === "covered" ? "medium" : "low"; // keyword-only judgements never claim high confidence

  return {
    mapped: {
      id: item.id,
      topic: item.topic,
      subtopic: item.subtopic,
      itemType: item.itemType,
      lecturePdfPages: [...item.lecturePdfPages].sort((a, b) => a - b),
      status,
      matches,
      gapNote,
      confidence,
    },
    candidates,
  };
}
