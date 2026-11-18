import { runSingleFlight } from "./single-flight.mjs";

const flightsByApp = new WeakMap();

export function runStudentCheckoutOnce({ app, studentUid, testId, operation } = {}) {
  if (!app || (typeof app !== "object" && typeof app !== "function")) {
    throw new TypeError("A Firebase app is required for checkout deduplication");
  }
  if (typeof studentUid !== "string" || !studentUid) {
    throw new TypeError("A student UID is required for checkout deduplication");
  }
  if (typeof testId !== "string" || !testId) {
    throw new TypeError("A test ID is required for checkout deduplication");
  }
  if (typeof operation !== "function") {
    throw new TypeError("A checkout operation is required");
  }

  let flightsByIdentity = flightsByApp.get(app);
  if (!flightsByIdentity) {
    flightsByIdentity = new Map();
    flightsByApp.set(app, flightsByIdentity);
  }

  const identity = JSON.stringify([studentUid, testId]);
  let key = flightsByIdentity.get(identity);
  if (!key) {
    key = {};
    flightsByIdentity.set(identity, key);
  }

  return runSingleFlight(key, async () => {
    try {
      return await operation();
    } finally {
      if (flightsByIdentity.get(identity) === key) flightsByIdentity.delete(identity);
      if (flightsByIdentity.size === 0) flightsByApp.delete(app);
    }
  });
}
