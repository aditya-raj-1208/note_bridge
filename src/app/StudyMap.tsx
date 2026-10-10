"use client";

import { useEffect, useState } from "react";
import type { AnalysisResult, CoverageStatus } from "@/lib/types";
import { ItemCard, STATUS_LABEL, UploadCard, validateFile } from "./components";

export default function StudyMap() {
  const [lecture, setLecture] = useState<File | null>(null);
  const [textbook, setTextbook] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!loading) return;
    const start = Date.now();
    const t = setInterval(() => setElapsed(Math.round((Date.now() - start) / 1000)), 1000);
    return () => clearInterval(t);
  }, [loading]);

  const canSubmit = !!lecture && !!textbook && !validateFile(lecture) && !validateFile(textbook) && !loading;

  async function analyze() {
    if (!lecture || !textbook) return;
    setElapsed(0);
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const fd = new FormData();
      fd.append("lecturePdf", lecture);
      fd.append("textbookPdf", textbook);
      const res = await fetch("/api/analyze", { method: "POST", body: fd });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data) throw new Error(data?.error ?? `Request failed (HTTP ${res.status}).`);
      setResult(data as AnalysisResult);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unexpected error.");
    } finally {
      setLoading(false);
    }
  }

  const items = result?.items ?? [];
  const count = (s: CoverageStatus) => items.filter((i) => i.status === s).length;
  const extras = items.filter((i) => (i.itemType === "example" || i.itemType === "derivation") && i.status !== "covered");

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">
      <h1 className="text-3xl font-bold">NoteBridge — connect your lecture to your textbook</h1>
      <p className="mt-2 opacity-80">
        Upload a lecture PDF and a searchable textbook PDF to see which lecture topics the book covers, on which PDF pages, and what may be extra lecture material.
      </p>

      <div className="mt-6 flex flex-col gap-4 md:flex-row">
        <UploadCard label="Lecture PDF" hint="Slides or notes as a text-based PDF." file={lecture} onChange={setLecture} />
        <UploadCard label="Textbook PDF" hint="A searchable (not scanned) PDF, max 20 MB / 1000 pages." file={textbook} onChange={setTextbook} />
      </div>

      <button
        type="button"
        disabled={!canSubmit}
        onClick={analyze}
        className="mt-5 rounded-lg bg-blue-700 px-5 py-2.5 font-semibold text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:bg-gray-400"
      >
        {loading ? `Analysing… ${elapsed}s` : "Build my study map"}
      </button>
      {loading && (
        <p className="mt-2 text-sm opacity-80" role="status">
          Extracting text and searching the textbook. Scanned or handwritten lecture pages are transcribed by Gemini OCR, which can take ~5–15 s per page.
        </p>
      )}

      <p className="mt-3 text-sm opacity-75">
        PDF page numbers refer to pages in the uploaded file. ‘Not located’ does not prove the concept is absent from the book.
      </p>

      {error && (
        <div role="alert" className="mt-4 rounded border border-red-300 bg-red-50 p-3 text-red-900">⚠ {error}</div>
      )}

      {!result && !loading && !error && (
        <div className="mt-8 rounded border border-gray-300 p-6 text-center opacity-70">
          No study map yet. Select both PDFs and click “Build my study map”.
        </div>
      )}

      {result && (
        <section className="mt-8">
          {result.mode === "keyword-fallback" && (
            <div className="mb-4 rounded border border-amber-400 bg-amber-50 p-3 text-amber-950">
              <b>Keyword-matching mode (non-AI fallback).</b> Topics and coverage statuses are computed by keyword overlap, not by an AI model. Reworded content may be missed.
            </div>
          )}
          {result.warnings.length > 0 && (
            <ul className="mb-4 list-disc pl-5 text-sm opacity-80">
              {result.warnings.map((w) => <li key={w}>{w}</li>)}
            </ul>
          )}
          <h2 className="text-xl font-semibold">Study map</h2>
          <p className="text-sm opacity-75">
            {result.lectureFilename} ({result.lecturePageCount} PDF pages) → {result.textbookFilename} ({result.textbookPageCount} PDF pages)
          </p>
          <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
            {(
              [
                ["Items identified", items.length],
                ["Covered", count("covered")],
                ["Partially covered", count("partially_covered")],
                ["Not located / uncertain", count("not_located") + count("uncertain")],
              ] as const
            ).map(([label, n]) => (
              <div key={label} className="rounded border border-gray-300 bg-white p-3 text-center text-gray-900">
                <div className="text-2xl font-bold">{n}</div>
                <div className="text-sm">{label}</div>
              </div>
            ))}
          </div>

          {items.length === 0 ? (
            <p className="mt-6">No topics could be identified in this lecture PDF.</p>
          ) : (
            <div className="mt-6 space-y-3">
              {items.map((item) => <ItemCard key={item.id} item={item} ocrPages={result.lectureOcrPages ?? []} />)}
            </div>
          )}

          <h2 className="mt-8 text-xl font-semibold">Possible extra lecture material</h2>
          <p className="text-sm opacity-75">Examples/derivations without strong textbook evidence among the searched candidate pages.</p>
          {extras.length === 0 ? (
            <p className="mt-2 text-sm">None flagged.</p>
          ) : (
            <ul className="mt-2 list-disc pl-5">
              {extras.map((i) => (
                <li key={i.id}>
                  <b>{i.subtopic ?? i.topic}</b> ({i.itemType}, lecture PDF page {i.lecturePdfPages.join(", ")}) — {STATUS_LABEL[i.status]}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </main>
  );
}
