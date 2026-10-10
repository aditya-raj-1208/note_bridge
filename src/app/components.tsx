"use client";

import { useRef } from "react";
import type { CoverageStatus, MappedItem } from "@/lib/types";

export const MAX_BYTES = 20 * 1024 * 1024;

export const STATUS_LABEL: Record<CoverageStatus, string> = {
  covered: "✓ Covered",
  partially_covered: "◐ Partially covered",
  not_located: "✗ Not located",
  uncertain: "? Uncertain",
};
const STATUS_CLASS: Record<CoverageStatus, string> = {
  covered: "bg-green-100 text-green-900 border-green-300",
  partially_covered: "bg-yellow-100 text-yellow-900 border-yellow-300",
  not_located: "bg-red-100 text-red-900 border-red-300",
  uncertain: "bg-gray-100 text-gray-900 border-gray-300",
};

export function validateFile(f: File): string | null {
  if (!f.name.toLowerCase().endsWith(".pdf")) return "Only .pdf files are supported.";
  if (f.size > MAX_BYTES) return "File is larger than 20 MB.";
  if (f.size === 0) return "File is empty.";
  return null;
}

export function UploadCard({ label, hint, file, onChange }: { label: string; hint: string; file: File | null; onChange: (f: File | null) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const error = file ? validateFile(file) : null;
  return (
    <div className="flex-1 rounded-lg border-2 border-dashed border-gray-300 bg-white p-5 text-gray-900">
      <h2 className="text-lg font-semibold">{label}</h2>
      <p className="mb-3 text-sm text-gray-600">{hint}</p>
      <input
        ref={input}
        type="file"
        accept="application/pdf,.pdf"
        aria-label={label}
        className="hidden"
        onChange={(e) => {
          onChange(e.target.files?.[0] ?? null);
          e.target.value = "";
        }}
      />
      {file ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="truncate font-mono text-sm" title={file.name}>📄 {file.name}</span>
          <span className="text-xs text-gray-500">({(file.size / 1024).toFixed(0)} KB)</span>
          <button type="button" className="text-sm text-blue-700 underline" onClick={() => input.current?.click()}>Replace</button>
          <button type="button" className="text-sm text-red-700 underline" onClick={() => onChange(null)}>Remove</button>
        </div>
      ) : (
        <button type="button" className="rounded border border-gray-400 px-3 py-1.5 text-sm hover:bg-gray-100" onClick={() => input.current?.click()}>
          Choose PDF…
        </button>
      )}
      {error && <p className="mt-2 text-sm text-red-700">⚠ {error}</p>}
    </div>
  );
}

export function ItemCard({ item, ocrPages = [] }: { item: MappedItem; ocrPages?: number[] }) {
  const fromOcr = item.lecturePdfPages.some((p) => ocrPages.includes(p));
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 text-gray-900 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="text-xs uppercase tracking-wide text-gray-500">
            {item.subtopic ? item.topic : "Topic"}
            {fromOcr && (
              <span className="ml-2 rounded border border-purple-300 bg-purple-50 px-1 normal-case text-purple-900" title="Lecture text transcribed by Gemini OCR; may contain errors">
                OCR text
              </span>
            )}
          </div>
          <div className="font-semibold">{item.subtopic ?? item.topic}</div>
        </div>
        <span className={`rounded border px-2 py-0.5 text-sm font-medium ${STATUS_CLASS[item.status]}`}>{STATUS_LABEL[item.status]}</span>
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-700">
        <span>Type: <b>{item.itemType}</b></span>
        <span>Lecture PDF page(s): <b>{item.lecturePdfPages.join(", ") || "—"}</b></span>
        <span>Textbook PDF page(s): <b>{item.matches.map((m) => m.pdfPage).join(", ") || "—"}</b></span>
        <span>Confidence: <b>{item.confidence}</b></span>
      </div>
      {item.matches.length > 0 && (
        <ul className="mt-3 space-y-2">
          {item.matches.map((m) => (
            <li key={m.pdfPage} className="rounded bg-gray-50 p-2 text-sm">
              <div className="font-medium">Textbook PDF page {m.pdfPage}</div>
              <blockquote className="border-l-4 border-blue-300 pl-2 italic">“{m.evidenceQuote}”</blockquote>
              <div className="text-xs text-gray-500">{m.coverageNote}</div>
            </li>
          ))}
        </ul>
      )}
      {item.questions && item.questions.length > 0 && (
        <div className="mt-3 rounded border border-blue-200 bg-blue-50 p-2 text-sm">
          <div className="font-medium">Practice questions from the book</div>
          <ul className="list-disc pl-5">
            {item.questions.map((q) => (
              <li key={`${q.pdfPage}-${q.text}`}>
                “{q.text}” <span className="text-xs text-gray-600">(textbook PDF page {q.pdfPage})</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {item.gapNote && <p className="mt-2 text-sm text-gray-700">Note: {item.gapNote}</p>}
    </div>
  );
}
