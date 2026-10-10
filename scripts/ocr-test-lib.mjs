// Shared helpers for scripts/ocr-test.mjs
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { getDocumentProxy } from "unpdf";

export const norm = (s) => s.normalize("NFKC").replace(/[\u2018\u2019]/g, "'").replace(/\s+/g, " ").trim().toLowerCase();

export const results = { failures: 0 };
export const check = (cond, msg) => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${msg}`);
  if (!cond) results.failures++;
};

export async function post(base, lecturePath, textbookPath) {
  const fd = new FormData();
  fd.append("lecturePdf", new Blob([readFileSync(lecturePath)]), lecturePath.split(/[\\/]/).pop());
  fd.append("textbookPdf", new Blob([readFileSync(textbookPath)]), textbookPath.split(/[\\/]/).pop());
  const t0 = Date.now();
  const res = await fetch(`${base}/api/analyze`, { method: "POST", body: fd });
  return { status: res.status, body: await res.json(), ms: Date.now() - t0 };
}

export function printItems(r) {
  for (const i of r.items ?? []) {
    const tb = i.matches.map((m) => m.pdfPage).join(",") || "-";
    console.log(`   [${i.status.padEnd(17)}] ${i.itemType.padEnd(10)} L${i.lecturePdfPages.join(",")} -> T${tb} | ${i.subtopic ?? i.topic}`);
  }
}

export const children = [];
export function start(args, env) {
  const child = spawn(process.execPath, args, { env: { ...process.env, ...env }, stdio: ["ignore", "ignore", "ignore"] });
  children.push(child);
  return child;
}

export async function waitFor(url) {
  for (let i = 0; i < 60; i++) {
    try {
      await fetch(url);
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  throw new Error(`server at ${url} did not start`);
}

/** Map of textbook PDF page -> normalized text, for verifying evidence quotes. */
export async function pageTexts(path) {
  const pdf = await getDocumentProxy(new Uint8Array(readFileSync(path)));
  const out = {};
  for (let i = 1; i <= pdf.numPages; i++) {
    const c = await (await pdf.getPage(i)).getTextContent();
    out[i] = norm(c.items.map((x) => x.str ?? "").join(" "));
  }
  return out;
}
