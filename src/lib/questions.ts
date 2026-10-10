// Practice questions copied verbatim from the textbook's extracted text (no AI, no answers).
// A question is a sentence that ends with "?" or starts with a typical exercise verb.
import type { BookQuestion, PdfPage } from "./types";
import { type PageIndex, idf } from "./search";
import { tokenize } from "./text";

const MAX_QUESTIONS_PER_ITEM = 2;
const QUESTION_START =
  /^(?:\(?\d+(?:\.\d+)*[.)]?\s+|\(?[a-z]\)\s+)?(?:calculate|determine|find|derive|show that|prove|explain|what|why|how|estimate|compute|obtain|evaluate|define|discuss|describe|distinguish|state|sketch)\b/i;

interface BankEntry {
  pdfPage: number;
  text: string;
  terms: Set<string>;
}

export function buildQuestionBank(pages: PdfPage[]): BankEntry[] {
  const bank: BankEntry[] = [];
  for (const page of pages) {
    const flat = page.text.replace(/\s*\n\s*/g, " ");
    for (const raw of flat.split(/(?<=[.?!])\s+(?=[A-Z(\d])/)) {
      const text = raw.trim();
      if (text.length < 25 || text.length > 300) continue;
      if (/\?$/.test(text) || QUESTION_START.test(text)) {
        bank.push({ pdfPage: page.pdfPage, text, terms: new Set(tokenize(text)) });
      }
    }
  }
  return bank;
}

/** Finds up to 2 book questions whose key terms overlap the lecture item; `used` prevents repeats across items. */
export function findQuestions(index: PageIndex, bank: BankEntry[], query: string, used: Set<string>): BookQuestion[] {
  const qTerms = [...new Set(tokenize(query))];
  if (qTerms.length === 0) return [];
  const weights = qTerms.map((t) => idf(index, t));
  const total = weights.reduce((a, b) => a + b, 0);
  const scored: { e: BankEntry; cov: number }[] = [];
  for (const e of bank) {
    if (used.has(e.text)) continue;
    let matched = 0;
    let count = 0;
    qTerms.forEach((t, i) => {
      if (e.terms.has(t)) {
        matched += weights[i];
        count++;
      }
    });
    const cov = total ? matched / total : 0;
    if (count >= Math.min(2, qTerms.length) && cov >= 0.5) scored.push({ e, cov });
  }
  scored.sort((a, b) => b.cov - a.cov);
  const out: BookQuestion[] = [];
  for (const { e } of scored) {
    if (out.length >= MAX_QUESTIONS_PER_ITEM) break;
    used.add(e.text);
    out.push({ pdfPage: e.pdfPage, text: e.text });
  }
  return out;
}
