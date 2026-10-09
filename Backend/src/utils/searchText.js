// ======================================================
// Search text normalization
//
// One normalization is used everywhere (search tags, stored course search
// fields and incoming queries) so that "AI & ML", "ai/ml", "AI-ML" and
// "Künstliche-Intelligenz" compare equal to their dictionary entries.
// ======================================================

const STOP_WORDS = new Set(["and", "und"]);

/**
 * Lowercase, strip accents, drop dots inside abbreviations ("A.I." -> "ai"),
 * turn every other punctuation into spaces, remove "and"/"und",
 * collapse whitespace.
 */
function normalizeTerm(value) {
  if (value === null || value === undefined) return "";

  return String(value)
    .toLowerCase()
    .replace(/ß/g, "ss")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\./g, "")
    .replace(/[^a-z0-9+#]+/g, " ")
    .split(" ")
    .filter((word) => word && !STOP_WORDS.has(word))
    .join(" ");
}

/** Normalized term without spaces, so "gen ai" and "genai" are the same key. */
const compactTerm = (value) => normalizeTerm(value).replace(/ /g, "");

const DEGREE_PREFIX =
  /^(?:(?:master|masters|bachelor|bachelors)(?: of (?:science|arts|engineering|business administration|education|laws|music|fine arts))?|msc|m sc|ma|meng|mtech|mres|mphil|med|bsc|b sc|ba|beng|btech)(?: in)? /;
const DEGREE_SUFFIX = / (?:msc|m sc|ma|meng|mtech|mres|mphil|med|bsc|b sc|ba|beng|btech)$/;

/**
 * Normalized course name without a leading/trailing degree
 * ("MSc Artificial Intelligence" -> "artificial intelligence",
 * "Informatik (M.Sc.)" -> "informatik"). Names that are only a degree
 * ("MBA") are kept as they are.
 */
function stripDegree(normalized) {
  const stripped = normalized.replace(DEGREE_PREFIX, "").replace(DEGREE_SUFFIX, "").trim();

  return stripped || normalized;
}

/** True when `phrase` occurs in `text` as whole words. Both must be normalized. */
const containsPhrase = (text, phrase) =>
  Boolean(text && phrase) && ` ${text} `.includes(` ${phrase} `);

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Damerau-free Levenshtein distance, stopping early once `max` is exceeded. */
function editDistance(a, b, max = Infinity) {
  if (Math.abs(a.length - b.length) > max) return max + 1;

  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);

  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    let rowMin = i;

    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      current[j] = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + cost);
      rowMin = Math.min(rowMin, current[j]);
    }

    if (rowMin > max) return max + 1;
    previous = current;
  }

  return previous[b.length];
}

/**
 * Typo tolerance for a phrase of this length. Short terms ("ai", "data")
 * never match fuzzily, so unrelated courses cannot appear because of them.
 */
const fuzzyTolerance = (length) => (length < 5 ? 0 : length < 9 ? 1 : 2);

module.exports = {
  normalizeTerm,
  compactTerm,
  stripDegree,
  containsPhrase,
  escapeRegex,
  editDistance,
  fuzzyTolerance,
};
