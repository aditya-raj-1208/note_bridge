// Minimal fake of the Gemini generateContent endpoint, for automated OCR pipeline tests only.
// It does NOT perform OCR: it returns a fixed transcription so we can verify page mapping and error handling.
// Control: POST /__mode with body {"mode": "..."}; GET /__stats returns {"requests": n}.
// Modes: ok | flaky429 | quota | daily | forbidden | error500 | hang | empty
import { createServer } from "node:http";

const port = Number(process.argv[2] ?? 3101);
let mode = "ok";
let requests = 0;
let flakyCount = 0;

const TRANSCRIPTION = [
  "Energy in Simple Harmonic Motion",
  "- Kinetic and potential energy exchange during each oscillation",
  "- Total mechanical energy E = 1/2 k A^2 remains constant",
  "Example: simple pendulum period for small angles T = 2 pi sqrt(L/g)",
].join("\n");

const send = (res, status, obj) => {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(obj));
};

createServer((req, res) => {
  let raw = "";
  req.on("data", (c) => (raw += c));
  req.on("end", () => {
    if (req.url === "/__mode") {
      mode = JSON.parse(raw).mode;
      requests = 0;
      flakyCount = 0;
      return send(res, 200, { mode });
    }
    if (req.url === "/__stats") return send(res, 200, { requests, mode });
    if (!/:generateContent$/.test(req.url ?? "")) return send(res, 404, { error: { code: 404, status: "NOT_FOUND", message: "no such route" } });

    requests++;
    if (!req.headers["x-goog-api-key"]) return send(res, 403, { error: { code: 403, status: "PERMISSION_DENIED", message: "missing key" } });
    let body;
    try {
      body = JSON.parse(raw);
    } catch {
      return send(res, 400, { error: { code: 400, status: "INVALID_ARGUMENT", message: "bad json" } });
    }
    const part = body?.contents?.[0]?.parts?.find((p) => p.inline_data);
    if (part?.inline_data?.mime_type !== "application/pdf" || !part.inline_data.data) {
      return send(res, 400, { error: { code: 400, status: "INVALID_ARGUMENT", message: "expected inline pdf" } });
    }
    const quotaErr = (message) => ({
      error: {
        code: 429,
        status: "RESOURCE_EXHAUSTED",
        message,
        details: [{ "@type": "type.googleapis.com/google.rpc.RetryInfo", retryDelay: "1s" }],
      },
    });
    switch (mode) {
      case "flaky429":
        if (flakyCount++ === 0) return send(res, 429, quotaErr("Quota exceeded for requests per minute"));
        break;
      case "quota":
        return send(res, 429, quotaErr("Quota exceeded for requests per minute"));
      case "daily":
        // Mirrors the real Gemini response observed on 2026-10-10: the message has no "per day";
        // the daily nature is only in the quotaId and the long retryDelay.
        return send(res, 429, {
          error: {
            code: 429,
            status: "RESOURCE_EXHAUSTED",
            message: "You exceeded your current quota, please check your plan and billing details. Quota exceeded for metric: generativelanguage.googleapis.com/generate_content_free_tier_requests, limit: 20. Please retry in 10h35.57",
            details: [
              { "@type": "type.googleapis.com/google.rpc.QuotaFailure", violations: [{ quotaMetric: "generativelanguage.googleapis.com/generate_content_free_tier_requests", quotaId: "GenerateRequestsPerDayPerProjectPerModel-FreeTier", quotaValue: "20" }] },
              { "@type": "type.googleapis.com/google.rpc.RetryInfo", retryDelay: "36035s" },
            ],
          },
        });
      case "forbidden":
        return send(res, 400, { error: { code: 400, status: "INVALID_ARGUMENT", message: "API key not valid. Please pass a valid API key." } });
      case "error500":
        return send(res, 500, { error: { code: 500, status: "INTERNAL", message: "internal" } });
      case "hang":
        return; // never respond -> client timeout
      case "empty":
        return send(res, 200, { candidates: [{ finishReason: "STOP", content: { parts: [{ text: "[no readable text]" }] } }] });
    }
    send(res, 200, { candidates: [{ finishReason: "STOP", content: { role: "model", parts: [{ text: TRANSCRIPTION }] } }] });
  });
}).listen(port, () => console.log(`fake-gemini listening on ${port}`));
