// Verifies page-by-page PDF text extraction with unpdf.
// Usage: node scripts/check-extract.mjs samples/textbook.pdf
import { readFileSync } from "node:fs";
import { getDocumentProxy } from "unpdf";

const file = process.argv[2] ?? "samples/textbook.pdf";
const pdf = await getDocumentProxy(new Uint8Array(readFileSync(file)));
console.log(`${file}: ${pdf.numPages} pages`);
for (let i = 1; i <= pdf.numPages; i++) {
  const page = await pdf.getPage(i);
  const content = await page.getTextContent();
  let lastY = null;
  let text = "";
  for (const item of content.items) {
    if (!("str" in item)) continue;
    const y = item.transform[5];
    if (lastY !== null && Math.abs(y - lastY) > 2) text += "\n";
    text += item.str;
    if (item.hasEOL) text += "\n";
    lastY = y;
  }
  text = text.replace(/\n{2,}/g, "\n").trim();
  console.log(`--- PDF page ${i} (${text.length} chars) ---\n${text.slice(0, 200)}`);
}
