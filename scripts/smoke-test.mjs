// End-to-end smoke test against a running NoteBridge server.
// Usage: node scripts/smoke-test.mjs [baseUrl]   (default http://localhost:3000)
// Requires samples created by: node scripts/make-sample-pdfs.mjs
import { readFileSync } from "node:fs";
import { getDocumentProxy } from "unpdf";

const base = process.argv[2] ?? "http://localhost:3000";
const norm = (s) => s.normalize("NFKC").replace(/[\u2018\u2019]/g, "'").replace(/\s+/g, " ").trim().toLowerCase();

async function post(lecturePath, textbookPath) {
  const fd = new FormData();
  if (lecturePath) fd.append("lecturePdf", new Blob([readFileSync(lecturePath)]), lecturePath.split("/").pop());
  if (textbookPath) fd.append("textbookPdf", new Blob([readFileSync(textbookPath)]), textbookPath.split("/").pop());
  const res = await fetch(`${base}/api/analyze`, { method: "POST", body: fd });
  return { status: res.status, body: await res.json() };
}

async function pageTexts(path) {
  const pdf = await getDocumentProxy(new Uint8Array(readFileSync(path)));
  const out = {};
  for (let i = 1; i <= pdf.numPages; i++) {
    const c = await (await pdf.getPage(i)).getTextContent();
    out[i] = norm(c.items.map((x) => x.str ?? "").join(" "));
  }
  return out;
}

let failures = 0;
const check = (cond, msg) => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${msg}`);
  if (!cond) failures++;
};

const ok = await post("samples/lecture.pdf", "samples/textbook.pdf");
check(ok.status === 200, `valid pair returns 200 (got ${ok.status})`);
const r = ok.body;
check(r.mode === "keyword-fallback", `mode is labelled keyword-fallback`);
check(r.items?.length > 0, `topics extracted: ${r.items?.length}`);
for (const i of r.items ?? []) {
  console.log(`   [${i.status.padEnd(17)}] ${i.itemType.padEnd(10)} L${i.lecturePdfPages.join(",")} -> T${i.matches.map((m) => m.pdfPage).join(",") || "-"} | ${i.subtopic ?? i.topic}`);
}
const book = await pageTexts("samples/textbook.pdf");
const allMatches = (r.items ?? []).flatMap((i) => i.matches);
check(allMatches.length > 0 && allMatches.every((m) => book[m.pdfPage] && book[m.pdfPage].includes(norm(m.evidenceQuote))), `all ${allMatches.length} evidence quotes are verbatim on their cited textbook page`);
const hooke = (r.items ?? []).find((i) => /hooke/i.test(i.subtopic ?? ""));
check(hooke && hooke.status === "covered" && hooke.matches.some((m) => m.pdfPage === 2), `Hooke's law covered on textbook PDF page 2`);
const quartz = (r.items ?? []).find((i) => /quartz/i.test(i.subtopic ?? ""));
check(quartz && ["not_located", "uncertain"].includes(quartz.status), `extra quartz example is not_located/uncertain (got ${quartz?.status})`);

check((r.items ?? []).length <= 15, `at most 15 topics returned (got ${r.items?.length})`);
check((r.items ?? []).every((i) => i.matches.length <= 3 && i.lecturePdfPages.length <= 3), "no item lists more than 3 textbook pages or 3 lecture pages");
const qs = (r.items ?? []).flatMap((i) => i.questions ?? []);
console.log(`   book questions: ${qs.map((q) => `[T${q.pdfPage}] ${q.text}`).join(" | ") || "(none)"}`);
check(qs.length > 0 && qs.every((q) => book[q.pdfPage]?.includes(norm(q.text))), `${qs.length} practice question(s), each verbatim on its cited textbook page`);

const scanned = await post("samples/lecture.pdf", "samples/scanned.pdf");
check(scanned.status === 422 && /searchable/i.test(scanned.body.error), `image-only PDF rejected: ${scanned.body.error}`);
const fake = await post("samples/not-a-pdf.pdf", "samples/textbook.pdf");
check(fake.status === 400 && /PDF/i.test(fake.body.error), `fake PDF rejected: ${fake.body.error}`);
const missing = await post("samples/lecture.pdf", null);
check(missing.status === 400, `missing textbook rejected: ${missing.body.error}`);

console.log(failures ? `\n${failures} check(s) FAILED` : "\nAll checks passed");
process.exit(failures ? 1 : 0);
