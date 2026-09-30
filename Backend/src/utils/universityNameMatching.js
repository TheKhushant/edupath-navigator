// Normalized university-name matching shared by the Germany seed script
// and the Excel import. Matching is deliberately conservative: a name only
// links when it points to exactly one university; ambiguity is reported.

function clean(value) {
  if (value === null || value === undefined) {
    return "";
  }

  return String(value).trim();
}

/** Lowercase, strip accents, markdown "**" and punctuation. */
function normalizeName(value) {
  return clean(value)
    .replace(/\*/g, "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** "Leipzig University" <-> "University of Leipzig" */
function swappedName(key) {
  const suffix = key.match(/^(.+) university$/);
  if (suffix) return `university of ${suffix[1]}`;

  const prefix = key.match(/^university of (.+)$/);
  if (prefix) return `${prefix[1]} university`;

  return undefined;
}

function nameParts(value) {
  const raw = clean(value).replace(/\*/g, "");

  return {
    full: normalizeName(raw),
    base: normalizeName(raw.replace(/\([^)]*\)/g, " ")),
    parens: [...raw.matchAll(/\(([^)]*)\)/g)]
      .map((match) => normalizeName(match[1]))
      .filter((key) => key.length >= 2),
  };
}

/**
 * Builds a lookup that links a name to one of `groups` ({ key, name }).
 * Several groups may share a key (e.g. the same university under two names).
 * Tiers are tried in order; a tier only links when it points to exactly one
 * key, otherwise the name is reported as ambiguous instead of guessing.
 *
 *  1. exact normalized name
 *  2. name without "(...)" or the "(...)" alias of the known name
 *  3. "X University" <-> "University of X"
 *
 * Returns (name) => { groupKey } | { reason, ambiguous? }
 */
function createNameMatcher(groups) {
  const tiers = [new Map(), new Map(), new Map()];

  const add = (tier, key, groupKey) => {
    if (!key) return;
    if (!tiers[tier].has(key)) tiers[tier].set(key, new Set());
    tiers[tier].get(key).add(groupKey);
  };

  for (const group of groups) {
    const { full, base, parens } = nameParts(group.name);

    add(0, full, group.key);

    [full, base, ...parens].forEach((key) => add(1, key, group.key));

    [full, base].map(swappedName).forEach((key) => add(2, key, group.key));
    [full, base].forEach((key) => add(2, key, group.key));
  }

  const groupNames = new Map();
  for (const group of groups) {
    if (!groupNames.has(group.key)) groupNames.set(group.key, group.name);
  }

  return (name) => {
    const { full, base } = nameParts(name);

    const lookups = [[full], [full, base], [full, base].map(swappedName)];

    for (let tier = 0; tier < tiers.length; tier++) {
      const found = new Set();

      lookups[tier].forEach((key) => {
        tiers[tier].get(key)?.forEach((groupKey) => found.add(groupKey));
      });

      if (found.size === 1) {
        return { groupKey: [...found][0] };
      }

      if (found.size > 1) {
        return {
          ambiguous: true,
          reason: `Ambiguous: matches ${[...found].map((key) => groupNames.get(key)).join(" / ")}`,
        };
      }
    }

    return {
      reason: "No matching university",
    };
  };
}

module.exports = {
  clean,
  normalizeName,
  swappedName,
  nameParts,
  createNameMatcher,
};
