// Lists Gemini models that support generateContent for the key in .env.local (free call, no tokens used).
// Prints model IDs only; never prints the key.
// Usage: node scripts/list-gemini-models.mjs
import { readFileSync } from "node:fs";

const line = readFileSync(".env.local", "utf8").split(/\r?\n/).find((l) => l.startsWith("GEMINI_API_KEY="));
const key = line?.slice("GEMINI_API_KEY=".length).trim();
if (!key) {
  console.log("GEMINI_API_KEY is empty in .env.local");
  process.exit(1);
}
const res = await fetch("https://generativelanguage.googleapis.com/v1beta/models?pageSize=200", { headers: { "x-goog-api-key": key } });
const body = await res.json();
console.log(`HTTP ${res.status}`);
if (!res.ok) {
  console.log(`error status: ${body?.error?.status}; message: ${String(body?.error?.message ?? "").slice(0, 200)}`);
  process.exit(1);
}
const names = (body.models ?? [])
  .filter((m) => m.supportedGenerationMethods?.includes("generateContent"))
  .map((m) => m.name.replace(/^models\//, ""))
  .filter((n) => /flash/i.test(n));
console.log("Flash models with generateContent:\n" + names.join("\n"));
