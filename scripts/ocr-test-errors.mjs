// Gemini error-handling cases for scripts/ocr-test.mjs (run against the fake Gemini server).
import { check, post } from "./ocr-test-lib.mjs";

export async function runErrorCases(A, setMode, TB) {
  console.log("\n# 5. Gemini errors");
  const errCase = async (mode, status, re, label) => {
    await setMode(mode);
    const x = await post(A, "samples/scanned.pdf", TB);
    check(x.status === status && re.test(x.body.error ?? ""), `${label} -> ${status} (got ${x.status}: ${x.body.error ?? "ok"}) [${(x.ms / 1000).toFixed(1)}s]`);
  };
  await errCase("forbidden", 401, /invalid/i, "invalid key");
  await setMode("flaky429");
  const r = await post(A, "samples/scanned.pdf", TB);
  check(r.status === 200 && JSON.stringify(r.body.lectureOcrPages) === "[1,2]", `transient 429 retried and succeeds (got ${r.status})`);
  await errCase("quota", 429, /rate limit/i, "persistent rate limit");
  await errCase("daily", 429, /daily quota/i, "daily quota exhausted (real Gemini response shape, no retries)");
  await errCase("error500", 503, /temporarily unavailable/i, "Gemini 500");
  await errCase("hang", 504, /timed out/i, "network timeout");
  await errCase("empty", 422, /could not read enough text/i, "unreadable page (no fabricated text)");
}
