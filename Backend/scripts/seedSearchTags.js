require("dotenv").config();

// ======================================================
// Search tag dictionary seed + course backfill (SAFE TO RE-RUN)
//
//   npm run seed:search-tags              add missing tags, then retag courses
//   npm run seed:search-tags -- --dry-run show what would change, write nothing
//   npm run seed:search-tags -- --retag-only   only recompute course search fields
//
// 1. Adds the tags from data/search-tags.json that are not in MongoDB yet.
//    Existing tags only gain missing aliases / relations; nothing an admin
//    edited is removed or overwritten.
// 2. Recomputes searchTags / searchName / searchSpecialization on every
//    Course, UniversityCourse and University (only documents that change are written).
//    This is also the backfill for courses created before search tags.
// ======================================================

const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");

const SearchTag = require("../src/models/SearchTag");
const Course = require("../src/models/Course");
const UniversityCourse = require("../src/models/UniversityCourse");
const University = require("../src/models/University");
const { normalizeTerm, compactTerm } = require("../src/utils/searchText");
const { retagAll } = require("../src/services/courseSearch");
const { invalidateDictionary } = require("../src/services/searchTagDictionary");

const DATA_FILE = path.join(__dirname, "..", "data", "search-tags.json");

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const RETAG_ONLY = args.includes("--retag-only");

const termKeys = (term) => [normalizeTerm(term), compactTerm(term)].filter(Boolean);

async function applySeed(seedTags, stats) {
  const all = await SearchTag.find({}).lean();

  // term key -> owning tag key, to keep every term unique across tags
  const owner = new Map();
  all.forEach((tag) => tag.aliasKeys.forEach((key) => owner.set(key, tag.key)));
  const byKey = new Map(all.map((tag) => [tag.key, tag]));

  for (const seed of seedTags) {
    const key = normalizeTerm(seed.name);
    const existing = byKey.get(key);

    if (existing?.status === "inactive") {
      stats.skippedInactive.push(seed.name);
      continue;
    }

    const usable = (seed.aliases ?? []).filter((alias) => {
      const conflict = termKeys(alias).map((item) => owner.get(item)).find((item) => item && item !== key);
      if (conflict) stats.conflicts.push(`"${alias}" (for ${seed.name}) is already used by "${byKey.get(conflict)?.name ?? conflict}"`);
      return !conflict;
    });

    if (!existing) {
      if (termKeys(seed.name).some((item) => owner.has(item))) {
        stats.conflicts.push(`"${seed.name}" is already an alias of "${byKey.get(owner.get(normalizeTerm(seed.name)))?.name}"`);
        continue;
      }

      const doc = { name: seed.name, aliases: usable, category: seed.category, source: "seed", status: "active" };
      const created = DRY_RUN ? { ...doc, _id: new mongoose.Types.ObjectId(), key, aliasKeys: [], related: [] } : (await SearchTag.create(doc)).toObject();

      byKey.set(key, created);
      [seed.name, ...usable].flatMap(termKeys).forEach((item) => owner.set(item, key));
      stats.created.push(seed.name);
      continue;
    }

    const known = new Set(existing.aliasKeys);
    const missing = usable.filter((alias) => !termKeys(alias).some((item) => known.has(item)));

    if (missing.length) {
      if (!DRY_RUN) {
        const tag = await SearchTag.findById(existing._id);
        tag.aliases.push(...missing);
        if (!tag.category && seed.category) tag.category = seed.category;
        await tag.save();
      }
      missing.flatMap(termKeys).forEach((item) => owner.set(item, key));
      stats.aliasesAdded += missing.length;
      stats.updated.add(seed.name);
    }
  }

  // ---------- Relations (second pass, all tags exist now) ----------

  for (const seed of seedTags) {
    const tag = byKey.get(normalizeTerm(seed.name));
    if (!tag || tag.status === "inactive") continue;

    const existingTargets = new Set((tag.related ?? []).map((item) => String(item.tag)));
    const additions = [];

    for (const [relation, names] of [
      ["closely_related", seed.closelyRelated ?? []],
      ["broader_related", seed.broaderRelated ?? []],
    ]) {
      for (const name of names) {
        const target = byKey.get(normalizeTerm(name));

        if (!target) {
          stats.missingRelations.push(`${seed.name} -> ${name}`);
          continue;
        }
        if (target.key === tag.key || existingTargets.has(String(target._id))) continue;

        existingTargets.add(String(target._id));
        additions.push({ tag: target._id, relation });
      }
    }

    if (additions.length) {
      if (!DRY_RUN) {
        await SearchTag.updateOne({ _id: tag._id }, { $push: { related: { $each: additions } } });
      }
      stats.relationsAdded += additions.length;
      if (!stats.created.includes(seed.name)) stats.updated.add(seed.name);
    }
  }
}

async function seedSearchTags() {
  if (!process.env.MONGO_URI) {
    console.error("MONGO_URI is missing in .env");
    process.exit(1);
  }

  const { tags: seedTags } = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));

  console.log(`Search tag seed (${DRY_RUN ? "DRY RUN - MongoDB will not be modified" : RETAG_ONLY ? "RETAG ONLY" : "SEED + RETAG"})`);

  await mongoose.connect(process.env.MONGO_URI, { autoIndex: false });
  console.log("MongoDB connected.");

  try {
    const stats = {
      created: [],
      updated: new Set(),
      aliasesAdded: 0,
      relationsAdded: 0,
      conflicts: [],
      missingRelations: [],
      skippedInactive: [],
    };

    if (!DRY_RUN) {
      // Indexes for the new collection / new course fields (no document changes)
      await Promise.all([SearchTag, Course, UniversityCourse, University].map((Model) => Model.createIndexes()));
    }

    if (!RETAG_ONLY) {
      await applySeed(seedTags, stats);

      console.log("");
      console.log(`Tags in file:        ${seedTags.length}`);
      console.log(`${DRY_RUN ? "Would create" : "Created"}:        ${stats.created.length}`);
      console.log(`${DRY_RUN ? "Would update" : "Updated"}:        ${stats.updated.size} (aliases +${stats.aliasesAdded}, relations +${stats.relationsAdded})`);

      stats.conflicts.forEach((item) => console.log(`  Skipped alias: ${item}`));
      stats.missingRelations.forEach((item) => console.log(`  Unknown related tag: ${item}`));
      stats.skippedInactive.forEach((item) => console.log(`  Inactive, left unchanged: ${item}`));
    }

    if (DRY_RUN && stats.created.length) {
      console.log("");
      console.log("Course retag preview uses the tags already in MongoDB (new tags are not written in a dry run).");
    }

    invalidateDictionary();
    const results = await retagAll([Course, UniversityCourse, University], { dryRun: DRY_RUN });

    console.log("");
    results.forEach(({ model, scanned, updated }) => {
      console.log(`${model}: ${scanned} scanned, ${updated} ${DRY_RUN ? "would be retagged" : "retagged"}`);
    });
  } finally {
    await mongoose.disconnect();
  }
}

seedSearchTags().catch((error) => {
  console.error("Search tag seed failed:", error);
  process.exit(1);
});
