// ======================================================
// BULK DELETE
//
// POST /api/<resource>/bulk-delete   body: { ids: ["UNI-001", "<ObjectId>", ...] }
//
// Deletes the records whose readable `id` or Mongo `_id` is listed, like
// the single DELETE /:id does for one record (no cascade: related records
// are left as they are). Ids that match nothing are reported as notFound.
// ======================================================

const MAX_BULK_DELETE = 500;
const MAX_ID_LENGTH = 100;

function readIds(body) {
  const ids = body?.ids;

  if (!Array.isArray(ids) || ids.length === 0) {
    return { error: "Send the records to delete as { ids: [...] } (at least one id)." };
  }
  if (ids.length > MAX_BULK_DELETE) {
    return { error: `At most ${MAX_BULK_DELETE} records can be deleted at once.` };
  }
  if (!ids.every((id) => typeof id === "string" && id.trim() && id.length <= MAX_ID_LENGTH)) {
    return { error: "Every id must be a non-empty string." };
  }

  return { ids: [...new Set(ids.map((id) => id.trim()))] };
}

/** Express handler deleting many records of `Model`; `label` is e.g. "universities". */
function bulkDeleteHandler(Model, label) {
  return async (req, res) => {
    const { ids, error } = readIds(req.body);

    if (error) {
      return res.status(400).json({ success: false, message: error });
    }

    try {
      const objectIds = ids.filter((id) => /^[a-f0-9]{24}$/i.test(id));
      const found = await Model.find(
        { $or: [{ id: { $in: ids } }, ...(objectIds.length ? [{ _id: { $in: objectIds } }] : [])] },
        { _id: 1, id: 1 },
      ).lean();

      const result = found.length
        ? await Model.deleteMany({ _id: { $in: found.map((doc) => doc._id) } })
        : { deletedCount: 0 };

      const matched = new Set(found.flatMap((doc) => [doc.id, String(doc._id)].filter(Boolean)));
      const notFound = ids.filter((id) => !matched.has(id));

      res.status(200).json({
        success: true,
        message: `${result.deletedCount} ${label} deleted`,
        data: {
          deleted: result.deletedCount,
          deletedIds: found.map((doc) => doc.id || String(doc._id)),
          notFound,
        },
      });
    } catch (deleteError) {
      res.status(500).json({
        success: false,
        message: `Failed to delete ${label}`,
        error: deleteError.message,
      });
    }
  };
}

module.exports = { bulkDeleteHandler, MAX_BULK_DELETE };
