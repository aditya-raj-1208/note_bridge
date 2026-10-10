// Text normalization and tokenization helpers shared by topic extraction, search and validation.

const STOPWORDS = new Set(
  (
    "a an the and or but if then else of to in on at by for with from into onto over under as is are was were be been being " +
    "this that these those it its their there here which who whom whose what when where why how all any each both few more most " +
    "other some such no nor not only own same so than too very can will just should would could may might must do does did " +
    "doing have has had having we you they he she i me my our your his her them us also using use used via per e g ie eg " +
    "example examples derivation definition formula lecture slide chapter section page figure table note notes recap summary " +
    "introduction overview today will let lets find show given one two three first second new"
  ).split(/\s+/)
);

/** Lowercase, unify quotes/dashes, collapse whitespace. Used for verbatim-quote validation. */
export function normalizeForCompare(s: string): string {
  return s
    .normalize("NFKC")
    .replace(/[\u2018\u2019\u201A\u201B\u2032]/g, "'")
    .replace(/[\u201C\u201D\u201E\u2033]/g, '"')
    .replace(/[\u2010-\u2015\u2212]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/** Very light stemming so "oscillations" matches "oscillation". */
function stem(w: string): string {
  if (w.length > 5 && w.endsWith("ies")) return w.slice(0, -3) + "y";
  if (w.length > 4 && w.endsWith("es") && /(ss|sh|ch|x|z)es$/.test(w)) return w.slice(0, -2);
  if (w.length > 3 && w.endsWith("s") && !w.endsWith("ss") && !w.endsWith("us") && !w.endsWith("is")) return w.slice(0, -1);
  return w;
}

/** Content-word tokens (stopwords removed, stemmed). */
export function tokenize(s: string): string[] {
  return normalizeForCompare(s)
    .replace(/[^a-z0-9'\s]/g, " ")
    .replace(/'s\b/g, "")
    .replace(/'/g, "")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOPWORDS.has(w) && !/^\d+$/.test(w))
    .map(stem);
}

/** Splits page text into sentence/line-sized snippets for evidence quotes. */
export function splitSentences(text: string): string[] {
  return text
    .split(/\n|(?<=[.!?])\s+(?=[A-Z])/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 15);
}
