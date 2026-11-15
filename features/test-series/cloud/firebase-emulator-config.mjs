const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

const EMULATOR_FIREBASE_CONFIG = Object.freeze({
  apiKey: "demo-api-key",
  authDomain: "localhost",
  projectId: "demo-railway-mitra-cbt",
  storageBucket: "demo-railway-mitra-cbt.appspot.com",
  messagingSenderId: "000000000000",
  appId: "1:000000000000:web:0000000000000000"
});

const EMULATOR_ENDPOINTS = Object.freeze({
  auth: "http://127.0.0.1:9099",
  firestore: Object.freeze({ host: "127.0.0.1", port: 8080 }),
  functions: Object.freeze({ host: "127.0.0.1", port: 5001 })
});

/**
 * Select the local demo project only when the exact opt-in flag is present
 * on a loopback HTTP(S) origin. Invalid or remote opt-ins fail closed.
 */
export function resolveTestSeriesFirebaseMode(locationLike) {
  const search = locationLike && typeof locationLike.search === "string"
    ? locationLike.search
    : "";
  const params = new URLSearchParams(search);

  const hostname = String(locationLike && locationLike.hostname || "").toLowerCase();
  const isLoopback = LOCAL_HOSTNAMES.has(hostname);

  // A developer opening localhost without the explicit emulator flag must
  // never fall through to the live Railway Mitra Firebase project. This guard
  // prevents accidental production OTPs or writes during local browser work.
  if (!params.has("rmFirebaseEmulator")) {
    if (isLoopback) {
      throw new Error("Local Test Series origin requires explicit emulator opt-in; use exactly ?rmFirebaseEmulator=1.");
    }
    return Object.freeze({ mode: "production" });
  }

  const values = params.getAll("rmFirebaseEmulator");
  if (values.length !== 1 || values[0] !== "1") {
    throw new Error("Invalid Test Series Firebase Emulator opt-in; use exactly ?rmFirebaseEmulator=1.");
  }

  const protocol = locationLike && locationLike.protocol;
  if (!["http:", "https:"].includes(protocol) || !isLoopback) {
    throw new Error("Test Series Firebase Emulator mode is restricted to localhost loopback origins.");
  }

  return Object.freeze({
    mode: "emulator",
    firebaseConfig: EMULATOR_FIREBASE_CONFIG,
    endpoints: EMULATOR_ENDPOINTS
  });
}
