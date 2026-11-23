/**
 * Server-anchored display clock for one CBT attempt.
 *
 * Wall-clock time is intentionally not consulted after construction: changing
 * the device date/time must not move an exam deadline forwards or backwards.
 */
function readBrowserMonotonicNow() {
  const source = globalThis.performance;
  if (!source || typeof source.now !== "function") {
    throw new Error("A monotonic browser clock is required for CBT timing");
  }
  return source.now();
}

export function createCbtServerClock({ serverNow, readMonotonicNow = readBrowserMonotonicNow } = {}) {
  const serverEpochMs = typeof serverNow === "string" ? Date.parse(serverNow) : NaN;
  if (!Number.isFinite(serverEpochMs)) {
    throw new Error("A valid server exam clock anchor is required");
  }
  if (typeof readMonotonicNow !== "function") {
    throw new Error("A monotonic clock reader is required");
  }
  const baseline = Number(readMonotonicNow());
  if (!Number.isFinite(baseline)) {
    throw new Error("The monotonic exam clock is unavailable");
  }

  let elapsedMs = 0;
  return Object.freeze({
    now() {
      let current;
      try {
        current = Number(readMonotonicNow());
      } catch {
        return serverEpochMs + elapsedMs;
      }
      if (Number.isFinite(current)) {
        // Clamp regressions; the derived server clock must never move backwards.
        elapsedMs = Math.max(elapsedMs, current - baseline);
      }
      return serverEpochMs + elapsedMs;
    }
  });
}
