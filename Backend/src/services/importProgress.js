// ======================================================
// EXCEL IMPORT PROGRESS
//
// The client sends a random ?progressId=... with a preview or confirm
// request and polls GET /api/universities/import/progress/:id while it
// runs. State is kept in memory for a few minutes; with several backend
// instances a poll may reach another instance and simply see "unknown".
// ======================================================

const ID_RE = /^[A-Za-z0-9_-]{8,64}$/;
const TTL_MS = 10 * 60 * 1000;
const MAX_ENTRIES = 1000;

const entries = new Map();

const isValidId = (id) => typeof id === "string" && ID_RE.test(id);

function cleanup() {
  const now = Date.now();
  for (const [id, entry] of entries) {
    if (now - entry.updatedAt > TTL_MS) entries.delete(id);
  }
  while (entries.size > MAX_ENTRIES) entries.delete(entries.keys().next().value);
}

/** Returns an update function for this id (a no-op when there is no valid id). */
function track(id, step) {
  if (!isValidId(id)) return () => {};

  cleanup();
  entries.set(id, { step, phase: "receiving", done: false, updatedAt: Date.now() });

  return (patch) => {
    const entry = entries.get(id);
    if (entry) Object.assign(entry, patch, { updatedAt: Date.now() });
  };
}

function get(id) {
  if (!isValidId(id)) return undefined;
  const entry = entries.get(id);
  if (!entry) return undefined;

  const { updatedAt, ...state } = entry;
  return state;
}

module.exports = { track, get, isValidId };
