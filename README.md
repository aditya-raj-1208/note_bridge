# NoteBridge — connect your lecture to your textbook

Upload one **lecture PDF** and one **searchable textbook PDF**. NoteBridge extracts lecture topics/subtopics
(keeping lecture PDF page numbers), searches the textbook page-by-page, and shows a study map with coverage
status, verified textbook **PDF page numbers**, verbatim evidence quotes, and possible extra lecture material.

## Run it

Requires Node.js 20+.

```powershell
cd "c:\Users\aditya raj\Desktop\cline hackathon\notebridge"
npm install
npm run dev
```

Open http://localhost:3000.

Production build: `npm run build` then `npm run start`.

> **Windows PowerShell note:** if you see "running scripts is disabled on this system", use `npm.cmd` instead
> of `npm` (e.g. `npm.cmd run dev`). This avoids changing the execution policy.

## Gemini OCR key (for scanned/handwritten lecture PDFs)

`.env.local` (git-ignored) contains an empty `GEMINI_API_KEY=` placeholder. `.env.example` is the committed template.
The key is read only on the server (`src/lib/ocr.ts`, guarded by `import "server-only"`, no `NEXT_PUBLIC_` prefix).

1. Create a key at https://aistudio.google.com/apikey (free tier; don't enable billing unless you mean to).
2. Open `.env.local` in your editor and paste it after the `=`, with no quotes or spaces: `GEMINI_API_KEY=your-key`.
3. Restart the server (`npm.cmd run dev`). Next.js reads `.env.local` only at startup and prints `- Environments: .env.local`.

Never paste the key into code, `.env.example`, chat or terminal commands. Note: Google may use free-tier content to improve its products.

### How lecture OCR works
- Each lecture page is first read with normal PDF text extraction. Only pages with < 20 extractable characters
  (scanned, photographed or handwritten) are sent to Gemini. Textbook PDFs are never OCR'd and must be searchable.
- Each such page is split into its own one-page PDF (`pdf-lib`, in memory) and sent in its own `generateContent`
  request, so every transcription stays tied to its original lecture PDF page number.
- Model: `gemini-3.6-flash` by default (override with `GEMINI_OCR_MODEL` in `.env.local`). `gemini-2.5-flash`
  now returns "no longer available to new users". Billing is never enabled and models are never switched automatically.
- Limits: at most 20 OCR pages per upload, sent one at a time with a 1.5 s gap, 60 s timeout per page. A 429/5xx
  error is retried up to 3 times, following Gemini's `retryDelay` (up to 60 s). A daily quota error stops right away
  with a clear message.
- If a page can't be read, it is reported as unreadable. No text is ever made up. If nothing readable is left, the
  upload is rejected with an error.
- Results show a warning listing the OCR'd pages, and the affected items are tagged **OCR text**.

### Test OCR locally
```powershell
npm.cmd run build
node scripts/ocr-test.mjs        # automated: fake Gemini, no real API calls (scanned, mixed, missing/invalid key, 429, quota, 500, timeout, unreadable)
# real handwritten test (uses your free-tier quota); start the app first with npm.cmd run start:
node scripts/ocr-test.mjs --real samples/fluid.pdf path\to\textbook.pdf
node scripts/list-gemini-models.mjs   # which Flash models your key can see (free metadata call)
```
Or in the UI: upload your handwritten lecture PDF together with a searchable textbook PDF.

### OCR limitations
- Accuracy depends on how clear the handwriting is and on scan quality. Always check important items against your notes.
- Complex equations (fractions, integrals, sub/superscripts, matrices, Greek letters) may be transcribed imperfectly
  or as LaTeX, which keyword matching handles poorly. Maths-heavy items lean towards `uncertain`/`not_located`.
- Diagrams only give their labels. Arrows, layout and spatial relationships are lost.
- Topic headings come from the first line of each page, so notes without clear headings give rougher topics.
- **Free-tier quota is small.** Verified on 2026-10-10: this key's project allows **20 OCR requests per day per model**
  (`GenerateRequestsPerDayPerProjectPerModel-FreeTier`, limit 20), plus a low per-minute limit. That's one request
  per OCR'd page, so about two 10-page handwritten uploads per day. When it runs out, the app says "daily quota is
  exhausted" and stops; it never switches to a paid model or enables billing. An optional workaround is setting
  `GEMINI_OCR_MODEL` to another free Flash model your key lists (`node scripts/list-gemini-models.mjs`), which has
  its own daily quota.
- One real page from `fluid.pdf` took about 11 s to OCR. A whole upload has a 4-minute OCR limit
  (`GEMINI_OCR_BUDGET_MS`), so a request can't hang indefinitely.

## Result size limits and book questions
- At most **15 topics/subtopics** per lecture (chosen round-robin across lecture pages so every page is represented;
  a warning says how many were found).
- At most **3 textbook pages** and **3 lecture pages** are listed per topic/subtopic.
- **Practice questions from the book:** for topics found in the textbook, up to 2 exercise-style sentences (ending in `?`
  or starting with Calculate/Determine/Find/Derive/…) are copied word for word from the matching textbook text, shown with
  their textbook PDF page, and checked to really appear on that page. No answers are generated, and no question is
  invented. A topic with no matching book question simply shows none.

## AI mode vs. keyword fallback

**No runtime AI API key was available during the build**, so this MVP runs in a clearly labelled
**keyword-matching (non-AI) fallback** (`mode: "keyword-fallback"`). The UI shows an amber banner saying so.
Coding with Cline doesn't give the app an API key. Model-driven topic extraction and coverage
judgements need an app key (e.g. `OPENAI_API_KEY`) in `.env.local` **plus** an adapter in `src/lib/llm.ts`
(not implemented yet).

How the fallback works:
- **Topics:** the first line of each lecture page is treated as the topic. The lines after it become subtopics,
  typed by their leading word (`Example`, `Derivation`/`Proof`, `Definition`, `Formula`/`Equation`, else `concept`).
- **Search:** pages are ranked by keyword overlap (stopwords removed, light stemming), with rarer words weighted
  more heavily and a bonus for matching word pairs. The top 5 candidate pages are kept per item.
- **Status:** based on what share of the item's key terms appears on the best page and in its best sentence:
  `covered`, `partially_covered`, `uncertain`, or `not_located`.
- **Citation validation:** every cited page must be one of the retrieved candidates, and every quote must appear
  verbatim (after whitespace/quote normalization) in that page's extracted text. Invalid citations are dropped.

Limitations: keyword search can miss reworded or synonym-based explanations. **"Not located" means the search
found no adequate evidence. It does not prove the book omits the topic.** Page numbers are PDF page numbers
in the uploaded file, not printed page numbers.

## Limits and safety

- PDF only (extension and `%PDF-` signature checked), 20 MB per file, 100 lecture pages, 1000 textbook pages
  (raised from 500, because the sample fluid mechanics textbook has 846 pages).
- Scanned/handwritten **lecture** pages are OCR'd with Gemini (see above). Scanned **textbooks** are rejected with a clear message.
- Uploads are processed in memory and never stored. File contents are not logged.

## Testing

```powershell
node scripts/make-sample-pdfs.mjs          # writes samples/*.pdf (lecture, textbook, scanned, fake)
node scripts/check-extract.mjs samples/textbook.pdf   # page-by-page extraction check
# with the app running on :3000:
node scripts/smoke-test.mjs                 # end-to-end API checks
```

### Manual test checklist
1. Upload `samples/lecture.pdf` + `samples/textbook.pdf` → click **Build my study map**.
2. A topic/subtopic list appears, along with the amber "Keyword-matching mode" banner.
3. "Hooke's law" is **Covered** with textbook PDF page 2, and the quote is visible on that page.
4. "Example: calibrating a quartz crystal oscillator…" is **Not located** and listed under *Possible extra lecture material*.
5. Replace the textbook with `samples/scanned.pdf` → you get a "requires searchable PDFs" error.
6. Select a non-PDF file → the button is disabled and an inline error appears. `samples/not-a-pdf.pdf` → you get a "missing PDF signature" error.
7. `npm run build` succeeds.

## Code map
- `src/app/page.tsx`, `src/app/StudyMap.tsx`, `src/app/components.tsx` — single-page UI
- `src/app/api/analyze/route.ts` — `POST /api/analyze` (multipart: `lecturePdf`, `textbookPdf`)
- `src/lib/pdf.ts` — upload validation and per-page extraction (`unpdf`)
- `src/lib/topics.ts` — topic extraction · `src/lib/search.ts` — page ranking
- `src/lib/coverage.ts` — status judgement · `src/lib/validate.ts` — citation validation
- `src/lib/llm.ts` — API-key detection (no adapter yet)
