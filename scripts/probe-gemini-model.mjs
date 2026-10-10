// Sends a tiny text-only prompt to each given model to check free-tier generateContent access.
// Prints HTTP status and Gemini's error status/message only; never prints the key.
// Usage: node scripts/probe-gemini-model.mjs gemini-2.5-flash gemini-3.5-flash ...
import { readFileSync } from "node:fs";

const line = readFileSync(".env.local", "utf8").split(/\r?\n/).find((l) => l.startsWith("GEMINI_API_KEY="));
const key = line?.slice("GEMINI_API_KEY=".length).trim();
if (!key) {
  console.log("GEMINI_API_KEY is empty in .env.local");
  process.exit(1);
}
for (const model of process.argv.slice(2)) {
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify({ contents: [{ parts: [{ text: "Reply with the single word OK." }] }], generationConfig: { maxOutputTokens: 256 } }),
  });
  const body = await res.json().catch(() => null);
  if (res.ok) {
    const text = body?.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("").trim();
    console.log(`${model}: HTTP 200 -> "${String(text).slice(0, 40)}"`);
  } else {
    console.log(`${model}: HTTP ${res.status} ${body?.error?.status ?? ""} -> ${String(body?.error?.message ?? "").slice(0, 220)}`);
  }
}
