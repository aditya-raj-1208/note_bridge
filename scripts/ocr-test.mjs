// OCR pipeline tests for NoteBridge.
//
// Automated mode (default): starts a fake Gemini server plus two production servers (one with a fake key
// pointed at the fake Gemini, one with no key) and checks page mapping and error handling.
// It never calls the real Gemini API and never reads your real key. Run `npm run build` first.
//   node scripts/ocr-test.mjs
//
// Real mode: sends a real handwritten PDF to an already running NoteBridge server (which uses
// GEMINI_API_KEY from .env.local) and prints what was extracted. Uses real Gemini free-tier quota.
//   node scripts/ocr-test.mjs --real samples/fluid.pdf [textbook.pdf] [baseUrl]
import { check, children, norm, pageTexts, post, printItems, results, start, waitFor } from "./ocr-test-lib.mjs";
import { runErrorCases } from "./ocr-test-errors.mjs";

if (process.argv[2] === "--real") {
  const lecture = process.argv[3] ?? "samples/fluid.pdf";
  const textbook = process.argv[4] ?? "samples/textbook.pdf";
  const base = process.argv[5] ?? "http://localhost:3000";
  console.log(`REAL Gemini OCR test: ${lecture} vs ${textbook} via ${base}`);
  const r = await post(base, lecture, textbook);
  console.log(`HTTP ${r.status} in ${(r.ms / 1000).toFixed(1)}s`);
  if (r.status !== 200) {
    console.log(`Error: ${r.body.error}`);
    process.exit(1);
  }
  console.log(`OCR pages: ${r.body.lectureOcrPages.join(", ") || "(none)"}`);
  console.log("Warnings:\n - " + r.body.warnings.join("\n - "));
  console.log(`Items (${r.body.items.length}):`);
  printItems(r.body);
  process.exit(0);
}

const FAKE = 3101, WITH_KEY = 3100, NO_KEY = 3102;
const NEXT = "node_modules/next/dist/bin/next";
const A = `http://127.0.0.1:${WITH_KEY}`, B = `http://127.0.0.1:${NO_KEY}`, F = `http://127.0.0.1:${FAKE}`;
const TB = "samples/textbook.pdf";
const setMode = (mode) => fetch(`${F}/__mode`, { method: "POST", body: JSON.stringify({ mode }) });
const requests = async () => (await (await fetch(`${F}/__stats`)).json()).requests;
const ocrPages = (r) => JSON.stringify(r.body.lectureOcrPages);
const find = (r, re) => r.body.items?.find((i) => re.test(i.subtopic ?? ""));

try {
  start(["scripts/fake-gemini.mjs", String(FAKE)], {});
  start([NEXT, "start", "-p", String(WITH_KEY)], { GEMINI_API_KEY: "fake-test-key", GEMINI_API_BASE: F, GEMINI_OCR_TIMEOUT_MS: "4000" });
  start([NEXT, "start", "-p", String(NO_KEY)], { GEMINI_API_KEY: "", GEMINI_API_BASE: F });
  await Promise.all([waitFor(`${F}/__stats`), waitFor(`${A}/`), waitFor(`${B}/`)]);
  const book = await pageTexts(TB);
  const quotesValid = (r) => r.body.items.flatMap((i) => i.matches).every((m) => book[m.pdfPage]?.includes(norm(m.evidenceQuote)));

  console.log("\n# 1. Searchable lecture: no OCR requests");
  await setMode("ok");
  let r = await post(A, "samples/lecture.pdf", TB);
  check(r.status === 200 && ocrPages(r) === "[]", `200 with no OCR pages (got ${r.status}, ${ocrPages(r)})`);
  check((await requests()) === 0, "fake Gemini received 0 requests");

  console.log("\n# 2. Fully scanned lecture (fake transcription)");
  await setMode("ok");
  r = await post(A, "samples/scanned.pdf", TB);
  check(r.status === 200, `200 (got ${r.status} ${r.body.error ?? ""})`);
  check(ocrPages(r) === "[1,2]", `OCR pages [1,2] (got ${ocrPages(r)})`);
  const n2 = await requests();
  check(n2 === 2, `exactly one OCR request per scanned page (got ${n2})`);
  const energy = find(r, /total mechanical energy/i);
  check(energy?.status === "covered" && energy.matches.some((m) => m.pdfPage === 3), "OCR'd item matched to textbook PDF page 3");
  check(r.body.items?.every((i) => i.lecturePdfPages.every((p) => p === 1 || p === 2)), "lecture page refs stay within [1,2]");
  check(quotesValid(r), "all evidence quotes verbatim on cited textbook pages");
  check(r.body.warnings.some((w) => /Gemini OCR/.test(w) && /errors/.test(w)), "warning says OCR text may contain errors");

  console.log("\n# 3. Mixed lecture: only page 2 is OCR'd");
  await setMode("ok");
  r = await post(A, "samples/mixed.pdf", TB);
  check(r.status === 200 && ocrPages(r) === "[2]", `OCR pages [2] (got ${ocrPages(r)})`);
  check((await requests()) === 1, "exactly 1 OCR request");
  printItems(r.body);
  check(JSON.stringify(find(r, /hooke/i)?.lecturePdfPages) === "[1]", "text page 1 item keeps lecture page 1");
  check(JSON.stringify(find(r, /total mechanical energy/i)?.lecturePdfPages) === "[2]", "OCR page 2 item has lecture page 2");
  const quartz = find(r, /quartz/i);
  check(JSON.stringify(quartz?.lecturePdfPages) === "[3]" && quartz.status === "not_located", "text page 3 extra example: page 3, not_located");
  check(quotesValid(r), "all evidence quotes verbatim");

  console.log("\n# 4. Missing API key");
  r = await post(B, "samples/scanned.pdf", TB);
  check(r.status === 422 && /GEMINI_API_KEY/.test(r.body.error), `scanned lecture -> 422: ${r.body.error}`);
  r = await post(B, "samples/mixed.pdf", TB);
  check(r.status === 200 && ocrPages(r) === "[]" && r.body.warnings.some((w) => /skipped/.test(w)), "mixed lecture without key -> 200 + 'skipped' warning");
  r = await post(B, "samples/lecture.pdf", "samples/scanned.pdf");
  check(r.status === 422 && /Textbook PDFs must be searchable/.test(r.body.error), "scanned textbook still rejected");

  await runErrorCases(A, setMode, TB);
} catch (e) {
  console.error("Test harness error:", e.message);
  results.failures++;
} finally {
  for (const c of children) c.kill();
}
console.log(results.failures ? `\n${results.failures} check(s) FAILED` : "\nAll OCR checks passed");
process.exit(results.failures ? 1 : 0);
