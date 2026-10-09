const mongoose = require("mongoose");
const { normalizeTerm, compactTerm } = require("../utils/searchText");

// ======================================================
// Shared search vocabulary.
//
// One document per concept, e.g. "Artificial Intelligence":
//   aliases  -> direct synonyms (AI, A.I., KI, Künstliche Intelligenz)
//   related  -> other concepts, either closely_related (Machine Learning)
//               or broader_related (Data Science)
//
// Courses store only the keys of the concepts found in their own text
// (see utils/searchable.js); synonyms and relations are resolved at
// search time, so editing this dictionary never duplicates course data.
// ======================================================

const RELATIONS = ["closely_related", "broader_related"];

const searchTagSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 80,
    },

    // normalizeTerm(name), unique
    key: {
      type: String,
      required: true,
      unique: true,
    },

    aliases: {
      type: [String],
      default: [],
    },

    // Normalized + compact forms of name and aliases, used for lookups
    aliasKeys: {
      type: [String],
      default: [],
    },

    related: {
      type: [
        {
          _id: false,
          tag: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "SearchTag",
            required: true,
          },
          relation: {
            type: String,
            enum: RELATIONS,
            required: true,
          },
        },
      ],
      default: [],
    },

    category: {
      type: String,
      trim: true,
    },

    status: {
      type: String,
      enum: ["active", "inactive"],
      default: "active",
    },

    // "seed" (scripts/seedSearchTags.js) or "manual" (created through the API)
    source: {
      type: String,
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

searchTagSchema.pre("validate", function () {
  this.name = String(this.name ?? "").replace(/\s+/g, " ").trim();
  this.key = normalizeTerm(this.name);

  // Trim, drop blanks, drop aliases equal to the name or to each other
  const seen = new Set([this.key]);
  this.aliases = (this.aliases ?? [])
    .map((alias) => String(alias ?? "").replace(/\s+/g, " ").trim())
    .filter((alias) => {
      const key = normalizeTerm(alias);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });

  this.aliasKeys = [
    ...new Set(
      [this.name, ...this.aliases].flatMap((term) => [normalizeTerm(term), compactTerm(term)]),
    ),
  ].filter(Boolean);

  // One relation per target, never to itself
  const targets = new Set([String(this._id)]);
  this.related = (this.related ?? []).filter((item) => {
    const target = String(item.tag);
    if (targets.has(target)) return false;
    targets.add(target);
    return true;
  });
});

searchTagSchema.index({ aliasKeys: 1 });
searchTagSchema.index({ status: 1, name: 1 });
searchTagSchema.index({ "related.tag": 1 });

const SearchTag = mongoose.model("SearchTag", searchTagSchema);

module.exports = SearchTag;
module.exports.RELATIONS = RELATIONS;
