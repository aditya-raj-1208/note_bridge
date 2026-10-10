// Runtime LLM availability check. No LLM provider adapter is implemented in this MVP because
// no application API key was available during the build. The app therefore runs in the
// clearly labelled "keyword-fallback" mode and never presents keyword results as AI output.
// GEMINI_API_KEY is intentionally excluded: it is used only for lecture-page OCR (see ocr.ts),
// not for topic extraction or coverage judgements.
const KNOWN_KEYS = ["OPENAI_API_KEY", "ANTHROPIC_API_KEY"] as const;

export function llmStatus(): { available: false; warning: string } {
  const configured = KNOWN_KEYS.filter((k) => !!process.env[k]);
  if (configured.length > 0) {
    return {
      available: false,
      warning: `An API key (${configured.join(", ")}) is configured, but no LLM adapter is implemented in this MVP yet. Results use keyword matching only.`,
    };
  }
  return {
    available: false,
    warning:
      "No runtime AI API key is configured, so topics and coverage come from keyword matching (non-AI fallback). Add an app API key to enable model-driven judgements.",
  };
}
