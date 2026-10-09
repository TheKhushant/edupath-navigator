const SearchTag = require("../models/SearchTag");
const {
  normalizeTerm,
  compactTerm,
  stripDegree,
  containsPhrase,
  editDistance,
  fuzzyTolerance,
} = require("../utils/searchText");

// ======================================================
// In-memory view of the SearchTag collection.
//
// The dictionary is small (one document per concept), so it is loaded once
// and cached; every course search and every course save reuses it instead
// of querying SearchTag again. The API invalidates it after edits, and the
// TTL picks up edits made by other processes (e.g. the seed script).
// ======================================================

const CACHE_MS = 60 * 1000;

// Relevance of a course tag, by how the tag relates to the searched term
const TIER_SCORE = {
  exact: 80,
  closely_related: 60,
  broader_related: 35,
};

// How the searched term was resolved to a concept
const VIA_FACTOR = {
  exact: 1, // the whole query is a known term ("AI")
  partial: 0.9, // a known term inside the query ("MSc AI in Germany")
  fuzzy: 0.85, // a typo of a known term ("Artifical Intelligence")
};

let cache = null;
let loadedAt = 0;
let loading = null;

/** Builds lookup structures from lean SearchTag documents. */
function buildDictionary(tags) {
  const active = tags.filter((tag) => tag.status !== "inactive");
  const byId = new Map(active.map((tag) => [String(tag._id), tag]));

  const concepts = new Map();
  const lookup = new Map();
  const phrases = [];

  for (const tag of active) {
    concepts.set(tag.key, {
      key: tag.key,
      name: tag.name,
      aliases: tag.aliases ?? [],
      phrases: [],
      related: [],
    });

    for (const term of [tag.name, ...(tag.aliases ?? [])]) {
      const normalized = normalizeTerm(term);
      const compact = compactTerm(term);

      if (normalized) {
        if (!lookup.has(normalized)) lookup.set(normalized, tag.key);
        phrases.push({ phrase: normalized, key: tag.key });
        concepts.get(tag.key).phrases.push(normalized);
      }
      if (compact && !lookup.has(compact)) lookup.set(compact, tag.key);
    }
  }

  for (const tag of active) {
    concepts.get(tag.key).related = (tag.related ?? [])
      .map((item) => ({ target: byId.get(String(item.tag)), relation: item.relation }))
      .filter(({ target }) => target && target.key !== tag.key)
      .map(({ target, relation }) => ({ key: target.key, relation }));
  }

  // Longest phrases first, so "machine learning" wins over "learning"
  phrases.sort((a, b) => b.phrase.length - a.phrase.length);

  return { concepts, lookup, phrases };
}

async function getDictionary({ fresh = false } = {}) {
  if (!fresh && cache && Date.now() - loadedAt < CACHE_MS) return cache;

  if (!loading) {
    loading = SearchTag.find({}, { name: 1, key: 1, aliases: 1, related: 1, status: 1 })
      .lean()
      .then((tags) => {
        cache = buildDictionary(tags);
        loadedAt = Date.now();
        return cache;
      })
      .finally(() => {
        loading = null;
      });
  }

  return loading;
}

function invalidateDictionary() {
  cache = null;
}

/** Concept key for a single term (name or alias), if the dictionary knows it. */
function resolveTerm(dictionary, term) {
  const normalized = normalizeTerm(term);

  return (
    dictionary.lookup.get(normalized) ??
    dictionary.lookup.get(stripDegree(normalized)) ??
    dictionary.lookup.get(compactTerm(term))
  );
}

/**
 * Concept keys whose name or alias occurs (as whole words) in any of the
 * given texts. This is what a course stores in `searchTags`.
 */
function tagTexts(dictionary, texts) {
  const keys = new Set();
  const normalizedTexts = texts.map(normalizeTerm).filter(Boolean);

  for (const text of normalizedTexts) {
    const exact = dictionary.lookup.get(text) ?? dictionary.lookup.get(text.replace(/ /g, ""));
    if (exact) keys.add(exact);

    for (const { phrase, key } of dictionary.phrases) {
      if (!keys.has(key) && containsPhrase(text, phrase)) keys.add(key);
    }
  }

  return [...keys];
}

/** Closest dictionary phrase within the typo tolerance of its length. */
function fuzzyMatches(dictionary, term, extraTolerance = 0) {
  const matches = new Map();

  for (const { phrase, key } of dictionary.phrases) {
    const tolerance = fuzzyTolerance(Math.min(phrase.length, term.length));
    if (tolerance === 0 || phrase[0] !== term[0]) continue;

    const distance = editDistance(term, phrase, tolerance + extraTolerance);
    if (distance <= tolerance + extraTolerance && distance > 0) {
      if (!matches.has(key) || matches.get(key) > distance) matches.set(key, distance);
    }
  }

  return [...matches.entries()]
    .sort((a, b) => a[1] - b[1])
    .map(([key, distance]) => ({ key, distance }));
}

/**
 * Turns a raw query into scored tag tiers.
 *
 *   "AI" -> concepts: [Artificial Intelligence (exact)]
 *           tiers:    artificial intelligence -> 80 (exact)
 *                     machine learning        -> 60 (closely_related)
 *                     data science            -> 35 (broader_related)
 *
 * Only one level of relations is followed, so a broader concept never
 * pulls in its own relations (no chain of ever looser matches).
 */
function expandQuery(dictionary, rawQuery) {
  const normalized = normalizeTerm(rawQuery);
  if (!normalized) return null;

  const core = stripDegree(normalized);
  const resolved = [];

  const direct = resolveTerm(dictionary, rawQuery) ?? dictionary.lookup.get(core);

  if (direct) {
    resolved.push({ key: direct, via: "exact" });
  } else {
    // Known terms inside a longer query, longest first, without overlaps
    let remaining = ` ${core} `;

    for (const { phrase, key } of dictionary.phrases) {
      if (remaining.includes(` ${phrase} `) && !resolved.some((item) => item.key === key)) {
        resolved.push({ key, via: "partial" });
        remaining = remaining.replace(` ${phrase} `, " | ");
      }
    }

    if (!resolved.length) {
      const [best] = fuzzyMatches(dictionary, core);
      if (best) resolved.push({ key: best.key, via: "fuzzy" });
    }
  }

  const tiers = new Map();
  const put = (key, score, relation) => {
    const current = tiers.get(key);
    if (!current || current.score < score) tiers.set(key, { score, relation });
  };

  for (const { key, via } of resolved) {
    const factor = VIA_FACTOR[via];
    put(key, Math.round(TIER_SCORE.exact * factor), "exact");

    for (const related of dictionary.concepts.get(key).related) {
      put(related.key, Math.round(TIER_SCORE[related.relation] * factor), related.relation);
    }
  }

  // The query itself, for custom course tags that are not in the dictionary
  put(core, TIER_SCORE.exact, "exact");

  // Names/aliases of the searched concepts, for synonym-exact name matches
  const exactPhrases = [
    ...new Set(resolved.flatMap(({ key }) => dictionary.concepts.get(key).phrases)),
  ];

  // Terms shown to the user as "related tags used"
  const expandedTerms = [];
  const listed = new Set();
  const addTerm = (term, relation) => {
    const id = normalizeTerm(term);
    if (listed.has(id)) return;
    listed.add(id);
    expandedTerms.push({ term, relation });
  };

  for (const { key } of resolved) {
    const concept = dictionary.concepts.get(key);
    addTerm(concept.name, "concept");
    concept.aliases.forEach((alias) => addTerm(alias, "alias"));
  }

  for (const relation of ["closely_related", "broader_related"]) {
    tiers.forEach((tier, key) => {
      if (tier.relation === relation && dictionary.concepts.has(key)) {
        addTerm(dictionary.concepts.get(key).name, relation);
      }
    });
  }

  return {
    query: String(rawQuery).trim(),
    normalized,
    core,
    concepts: resolved.map(({ key, via }) => ({ key, name: dictionary.concepts.get(key).name, via })),
    tiers,
    exactPhrases,
    expandedTerms,
  };
}

/**
 * Concept keys worth suggesting when a search found nothing: near-typos,
 * terms that start with the query ("gen" -> "generative ai") and the
 * concepts related to what was searched.
 */
function suggestionKeys(dictionary, expansion, limit = 8) {
  const keys = new Set();
  const { core } = expansion;

  fuzzyMatches(dictionary, core, 1).forEach(({ key }) => keys.add(key));

  if (core.length >= 2) {
    for (const { phrase, key } of dictionary.phrases) {
      if (phrase.startsWith(core) || (phrase.length >= 4 && core.startsWith(phrase))) keys.add(key);
    }
  }

  expansion.concepts.forEach(({ key }) => keys.add(key));

  // Close relatives of every candidate ("generativ" -> Generative AI ->
  // Artificial Intelligence), so a candidate without courses still leads somewhere
  [...keys].forEach((key) => {
    dictionary.concepts
      .get(key)
      .related.filter((related) => related.relation === "closely_related")
      .forEach((related) => keys.add(related.key));
  });

  return [...keys].slice(0, limit);
}

module.exports = {
  TIER_SCORE,
  buildDictionary,
  getDictionary,
  invalidateDictionary,
  resolveTerm,
  tagTexts,
  expandQuery,
  suggestionKeys,
};
