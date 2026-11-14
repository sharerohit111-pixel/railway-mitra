"use strict";

/**
 * Convert a Firestore Timestamp, Date, or date-like value to a valid Date.
 * Corrupt or unsupported persisted values fail closed as null.
 */
function toValidDate(value) {
  if (value === null || value === undefined || value === "") return null;
  try {
    const parsed = value && typeof value.toDate === "function"
      ? value.toDate()
      : new Date(value);
    return parsed instanceof Date && Number.isFinite(parsed.getTime())
      ? parsed
      : null;
  } catch {
    return null;
  }
}

module.exports = { toValidDate };
