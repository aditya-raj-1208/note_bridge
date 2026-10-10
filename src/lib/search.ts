// Transparent lexical page ranking (no embeddings / vector DB).
import type { PdfPage } from "./types";
import { tokenize } from "./text";

export interface PageIndex {
  pages: PdfPage[];
  termFreq: Map<string, number>[]; // per page
  bigrams: Set<string>[]; // per page
  docFreq: Map<string, number>;
  n: number;
}

export interface Candidate {
  page: PdfPage;
  score: number;
  coverage: number; // weighted fraction (0..1) of query terms present on the page
}

export function buildIndex(pages: PdfPage[]): PageIndex {
  const termFreq: Map<string, number>[] = [];
  const bigrams: Set<string>[] = [];
  const docFreq = new Map<string, number>();
  for (const p of pages) {
    const toks = tokenize(p.text);
    const tf = new Map<string, number>();
    for (const t of toks) tf.set(t, (tf.get(t) ?? 0) + 1);
    const bg = new Set<string>();
    for (let i = 0; i + 1 < toks.length; i++) bg.add(`${toks[i]} ${toks[i + 1]}`);
    for (const t of tf.keys()) docFreq.set(t, (docFreq.get(t) ?? 0) + 1);
    termFreq.push(tf);
    bigrams.push(bg);
  }
  return { pages, termFreq, bigrams, docFreq, n: pages.length };
}

/** IDF weight; terms absent from the book get the maximum weight (they count against coverage). */
export function idf(index: PageIndex, term: string): number {
  const df = index.docFreq.get(term) ?? 0;
  return Math.log(1 + index.n / Math.max(df, 0.5));
}

export function searchPages(index: PageIndex, query: string, contextQuery = "", topK = 5): Candidate[] {
  const qTerms = [...new Set(tokenize(query))];
  if (qTerms.length === 0) return [];
  const ctxTerms = [...new Set(tokenize(contextQuery))].filter((t) => !qTerms.includes(t));
  const qToks = tokenize(query);
  const qBigrams = new Set<string>();
  for (let i = 0; i + 1 < qToks.length; i++) qBigrams.add(`${qToks[i]} ${qToks[i + 1]}`);

  const weights = qTerms.map((t) => idf(index, t));
  const totalWeight = weights.reduce((a, b) => a + b, 0);

  const results: Candidate[] = [];
  index.pages.forEach((page, i) => {
    const tf = index.termFreq[i];
    let score = 0;
    let matchedWeight = 0;
    qTerms.forEach((t, j) => {
      const f = tf.get(t);
      if (f) {
        score += weights[j] * (1 + Math.log(f));
        matchedWeight += weights[j];
      }
    });
    if (matchedWeight === 0) return;
    for (const t of ctxTerms) if (tf.has(t)) score += 0.3 * idf(index, t); // weak topic context tie-breaker
    let phraseHits = 0;
    for (const b of qBigrams) if (index.bigrams[i].has(b)) phraseHits++;
    score += phraseHits * 1.5;
    results.push({ page, score, coverage: matchedWeight / totalWeight });
  });
  return results.sort((a, b) => b.score - a.score).slice(0, topK);
}
