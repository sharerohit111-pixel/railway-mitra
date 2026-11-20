const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
const GITHUB_PAGES_HOSTNAME = "sharerohit111-pixel.github.io";
const GITHUB_PAGES_REPOSITORY_PATH = "/railway-mitra";
const APPROVED_CUSTOM_PRODUCTION_HOSTNAME = "railway-mitra.com";

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

function isApprovedProductionOrigin(locationLike, hostname) {
  if (hostname === APPROVED_CUSTOM_PRODUCTION_HOSTNAME) return true;
  if (hostname !== GITHUB_PAGES_HOSTNAME) return false;

  const pathname = typeof locationLike.pathname === "string"
    ? locationLike.pathname
    : "";

  return pathname === GITHUB_PAGES_REPOSITORY_PATH ||
    pathname.startsWith(GITHUB_PAGES_REPOSITORY_PATH + "/");
}

/**
 * Select the local demo project only when the exact opt-in flag is present
 * on a loopback HTTP(S) origin. Invalid or remote opt-ins fail closed.
 *
 * Without emulator opt-in, production Firebase is available only on the
 * explicitly approved Railway Mitra custom domain or this repository's
 * GitHub Pages path. Preview and unrelated hosted origins must not silently
 * send OTPs or requests to the live project.
 */
export function resolveTestSeriesFirebaseMode(locationLike) {
  const protocol = String(locationLike && locationLike.protocol || "").toLowerCase();
  if (!["http:", "https:"].includes(protocol)) {
    throw new Error("Unsupported Test Series origin; use HTTPS or localhost HTTP with explicit emulator opt-in.");
  }

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
    if (protocol !== "https:") {
      throw new Error("Hosted Test Series Firebase requires HTTPS; use an HTTPS origin or local emulator mode.");
    }
    if (!isApprovedProductionOrigin(locationLike, hostname)) {
      throw new Error("Unapproved Test Series hosted origin; production Firebase is restricted to approved Railway Mitra origins.");
    }
    return Object.freeze({ mode: "production" });
  }

  const values = params.getAll("rmFirebaseEmulator");
  if (values.length !== 1 || values[0] !== "1") {
    throw new Error("Invalid Test Series Firebase Emulator opt-in; use exactly ?rmFirebaseEmulator=1.");
  }

  if (!isLoopback) {
    throw new Error("Test Series Firebase Emulator mode is restricted to localhost loopback origins.");
  }

  return Object.freeze({
    mode: "emulator",
    firebaseConfig: EMULATOR_FIREBASE_CONFIG,
    endpoints: EMULATOR_ENDPOINTS
  });
}
