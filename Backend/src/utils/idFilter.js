const mongoose = require("mongoose");

// Finds a record by its MongoDB _id or its readable id (e.g. "APP-2026-001").
// Querying _id with a non-ObjectId string throws a CastError, so _id is only
// included when the value is a valid ObjectId (same rule as studentController).
const idFilter = (id) =>
  mongoose.Types.ObjectId.isValid(id)
    ? { $or: [{ _id: id }, { id }] }
    : { id };

module.exports = { idFilter };
