// Deterministic (non-AI) lecture topic/subtopic extraction.
// Heuristic: the first meaningful line on a lecture page is treated as the topic heading;
// subsequent lines become subtopic items, typed by their leading keyword.
import type { ItemType, LectureItem, PdfPage } from "./types";
import { tokenize } from "./text";

const MAX_COLLECT = 200; // internal cap while scanning
export const MAX_TOPICS = 15; // topics/subtopics returned per lecture (spread evenly across pages)
const MAX_LECTURE_PAGES_PER_ITEM = 3; // never list more than 3 lecture pages for one item
const MAX_ITEMS_PER_PAGE = 8;
const MAX_LABEL = 140;

const TYPE_PATTERNS: [RegExp, ItemType][] = [
  [/^(worked\s+)?examples?\b|^e\.?g\.?\b|^exercise\b|^problem\b|^case study\b/i, "example"],
  [/^derivations?\b|^deriv(e|ing)\b|^proofs?\b|^show that\b/i, "derivation"],
  [/^definitions?\b|^def\.?\b|^defined as\b/i, "definition"],
  [/^formulas?\b|^equations?\b|^theorem\b|^law\b/i, "formula"],
];

function cleanLine(line: string): string {
  return line.replace(/^[\s\-–—•●▪◦*·>]+/, "").replace(/^\d+[.)]\s+/, "").trim();
}

function classify(line: string): ItemType {
  for (const [re, type] of TYPE_PATTERNS) if (re.test(line)) return type;
  return "concept";
}

function truncate(s: string): string {
  return s.length > MAX_LABEL ? s.slice(0, MAX_LABEL - 1).trimEnd() + "…" : s;
}

function isNoise(line: string): boolean {
  if (line.length < 4) return true;
  if (/^(page\s*)?\d+(\s*(of|\/)\s*\d+)?$/i.test(line)) return true; // page numbers
  if (/^(©|copyright)/i.test(line)) return true;
  return tokenize(line).length < 2;
}

export function extractLectureItems(pages: PdfPage[]): { items: LectureItem[]; totalFound: number } {
  // key -> item (merge repeated topic headings across slides)
  const byKey = new Map<string, LectureItem>();
  const order: string[] = [];
  let lastTopic = "";

  const upsert = (key: string, make: () => LectureItem, page: number) => {
    const existing = byKey.get(key);
    if (existing) {
      if (!existing.lecturePdfPages.includes(page) && existing.lecturePdfPages.length < MAX_LECTURE_PAGES_PER_ITEM) {
        existing.lecturePdfPages.push(page);
      }
      return;
    }
    if (order.length >= MAX_COLLECT) return;
    byKey.set(key, make());
    order.push(key);
  };

  for (const page of pages) {
    const lines = page.text.split("\n").map(cleanLine).filter((l) => !isNoise(l));
    if (lines.length === 0) continue;

    // Heading: first line if reasonably short; otherwise keep previous topic.
    let startIdx = 0;
    if (lines[0].length <= 80 && classify(lines[0]) === "concept") {
      lastTopic = truncate(lines[0].replace(/[:.]$/, ""));
      startIdx = 1;
      const topicKey = `topic::${tokenize(lastTopic).join(" ")}`;
      upsert(
        topicKey,
        () => ({
          id: `item-${order.length + 1}`,
          topic: lastTopic,
          itemType: "concept",
          lecturePdfPages: [page.pdfPage],
          queryText: lastTopic,
        }),
        page.pdfPage
      );
    }
    const topic = lastTopic || `Lecture page ${page.pdfPage}`;

    let count = 0;
    for (const line of lines.slice(startIdx)) {
      if (count >= MAX_ITEMS_PER_PAGE) break;
      const itemType = classify(line);
      const label = truncate(line);
      const key = `sub::${tokenize(line).join(" ")}`;
      upsert(
        key,
        () => ({
          id: `item-${order.length + 1}`,
          topic,
          subtopic: label,
          itemType,
          lecturePdfPages: [page.pdfPage],
          queryText: line,
        }),
        page.pdfPage
      );
      count++;
    }
  }
  const all = order.map((k) => byKey.get(k)!);
  return { items: selectItems(all, MAX_TOPICS), totalFound: all.length };
}

/** Keeps at most `max` items, taking them round-robin across lecture pages (page heading first, then its subtopics). */
function selectItems(items: LectureItem[], max: number): LectureItem[] {
  if (items.length <= max) return items;
  const byPage = new Map<number, LectureItem[]>();
  for (const it of items) {
    const p = it.lecturePdfPages[0];
    byPage.set(p, [...(byPage.get(p) ?? []), it]);
  }
  const queues = [...byPage.keys()].sort((a, b) => a - b).map((p) => byPage.get(p)!);
  const picked = new Set<LectureItem>();
  for (let round = 0; picked.size < max; round++) {
    let any = false;
    for (const q of queues) {
      if (picked.size >= max) break;
      if (round < q.length) {
        picked.add(q[round]);
        any = true;
      }
    }
    if (!any) break;
  }
  return items.filter((i) => picked.has(i));
}
