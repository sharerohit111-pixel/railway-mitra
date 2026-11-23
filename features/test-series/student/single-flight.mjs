// Deduplicate concurrent work for the same UI control. The pending entry is
// removed after either success or failure so a later user retry can run.
const pendingByKey = new WeakMap();

export function runSingleFlight(key, operation) {
  if ((typeof key !== "object" && typeof key !== "function") || key === null) {
    throw new TypeError("Single-flight key must be an object");
  }
  if (typeof operation !== "function") {
    throw new TypeError("Single-flight operation must be a function");
  }
  const existing = pendingByKey.get(key);
  if (existing) return existing;

  const pending = Promise.resolve()
    .then(operation)
    .finally(() => {
      if (pendingByKey.get(key) === pending) pendingByKey.delete(key);
    });
  pendingByKey.set(key, pending);
  return pending;
}
