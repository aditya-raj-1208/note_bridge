// Prints size, page count and extractable-text stats for a PDF (checks the NoteBridge limits).
// Usage: node scripts/pdf-info.mjs path/to/file.pdf
import { readFileSync, statSync } from "node:fs";
import { getDocumentProxy } from "unpdf";

const file = process.argv[2];
const size = statSync(file).size;
const pdf = await getDocumentProxy(new Uint8Array(readFileSync(file)));
let textPages = 0;
let total = 0;
for (let i = 1; i <= pdf.numPages; i++) {
  const c = await (await pdf.getPage(i)).getTextContent();
  const n = c.items.map((x) => x.str ?? "").join("").trim().length;
  total += n;
  if (n >= 20) textPages++;
}
console.log(`${file}: ${(size / 1048576).toFixed(1)} MB, ${pdf.numPages} pages, ${textPages} pages with text, ${total} chars`);
console.log(`within limits (<=20 MB, <=500 pages): ${size <= 20 * 1048576 && pdf.numPages <= 500}`);
