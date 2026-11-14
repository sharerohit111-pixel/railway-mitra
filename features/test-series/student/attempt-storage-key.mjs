const PURPOSE_PREFIX = Object.freeze({
  attempt: "rm-cbt-attempt",
  pending: "rm-cbt-pending",
  position: "rm-cbt-position"
});

function encodePart(value, field) {
  if (typeof value !== "string" || !value.trim()) {
    throw new TypeError(field + " must be a non-empty string");
  }
  return encodeURIComponent(value);
}

/**
 * Build a localStorage key scoped to one Firebase app, student, test and (where
 * applicable) attempt. This is collision avoidance only, never an auth check.
 */
export function buildCbtStorageKey({ appId, studentUid, testId, purpose, attemptId } = {}) {
  const prefix = PURPOSE_PREFIX[purpose];
  if (!prefix) throw new TypeError("purpose must be attempt, pending, or position");

  const scope = [
    encodePart(appId, "appId"),
    encodePart(studentUid, "studentUid"),
    encodePart(testId, "testId")
  ].join(":");

  if (purpose === "attempt") return prefix + ":" + scope;
  return prefix + ":" + scope + ":" + encodePart(attemptId, "attemptId");
}
