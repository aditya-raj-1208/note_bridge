// Real Gemini OCR of ONE page (uses 1 free-tier request). Prints HTTP status, rate-limit details and the transcription.
// Never prints the key. Usage: node scripts/ocr-one-page.mjs samples/fluid.pdf 1 [model]
import { readFileSync } from "node:fs";
import { PDFDocument } from "pdf-lib";

const [file = "samples/fluid.pdf", pageArg = "1", model = "gemini-3.6-flash"] = process.argv.slice(2);
const line = readFileSync(".env.local", "utf8").split(/\r?\n/).find((l) => l.startsWith("GEMINI_API_KEY="));
const key = line?.slice("GEMINI_API_KEY=".length).trim();
if (!key) {
  console.log("GEMINI_API_KEY is empty in .env.local");
  process.exit(1);
}
const src = await PDFDocument.load(new Uint8Array(readFileSync(file)), { ignoreEncryption: true });
const single = await PDFDocument.create();
const [copied] = await single.copyPages(src, [Number(pageArg) - 1]);
single.addPage(copied);
const data = Buffer.from(await single.save()).toString("base64");
const t0 = Date.now();
const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
  method: "POST",
  headers: { "Content-Type": "application/json", "x-goog-api-key": key },
  body: JSON.stringify({
    contents: [{ parts: [{ inline_data: { mime_type: "application/pdf", data } }, { text: "Transcribe all handwritten text on this page exactly as written, one line per line of notes. Put the main heading first. Write equations in plain text. Write [illegible] for unreadable parts. Do not add anything." }] }],
    generationConfig: { temperature: 0, maxOutputTokens: 8192 },
  }),
});
const body = await res.json().catch(() => null);
console.log(`${model} page ${pageArg}: HTTP ${res.status} in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
if (!res.ok) {
  console.log(`error: ${body?.error?.status} ${String(body?.error?.message ?? "").slice(0, 400)}`);
  for (const d of body?.error?.details ?? []) {
    if (d.retryDelay) console.log(`retryDelay: ${d.retryDelay}`);
    for (const v of d.violations ?? []) console.log(`violation: ${v.quotaMetric ?? ""} ${v.quotaId ?? ""} limit=${v.quotaValue ?? ""}`);
  }
  process.exit(1);
}
const cand = body?.candidates?.[0];
console.log(`finishReason: ${cand?.finishReason}; usage: ${JSON.stringify(body?.usageMetadata ?? {})}`);
console.log("---- transcription ----");
console.log((cand?.content?.parts ?? []).filter((p) => !p.thought).map((p) => p.text ?? "").join(""));
