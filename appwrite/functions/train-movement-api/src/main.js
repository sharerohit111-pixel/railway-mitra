import { createRemoteJWKSet, jwtVerify } from "jose";
import { randomUUID } from "node:crypto";

const PROJECT_ID = "6b070890000e2fca34fd";
const DATABASE_ID = "railway_mitra";
const TABLE_ID = "train_movement_reports";
const ROUTE_ID = "14704-lgh-phl";
const FIREBASE_PROJECT_ID = process.env.FIREBASE_PROJECT_ID || "railway-mitra";
const APPWRITE_ENDPOINT = "https://sgp.cloud.appwrite.io/v1";
const jwks = createRemoteJWKSet(new URL("https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com"));
const ROUTE = [
  { id: "0", name: "Lalgarh Junction", km: 0 },
  { id: "1", name: "Nal Halt", km: 10 },
  { id: "2", name: "Gajner", km: 30 },
  { id: "3", name: "Kolayat", km: 46 },
  { id: "4", name: "Diyatara Road", km: 62 },
  { id: "5", name: "Nokhra", km: 84 },
  { id: "6", name: "Sird", km: 105 },
  { id: "7", name: "Bap", km: 122 },
  { id: "8", name: "Malar", km: 145 },
  { id: "9", name: "Phalodi Junction", km: 158 }
];
const SPEEDS = { passenger: 105, goods: 60 };

function headerValue(headers, name) {
  if (!headers) return "";
  if (Array.isArray(headers)) {
    const found = headers.find(item => String(item.name || "").toLowerCase() === name.toLowerCase());
    return found?.value || "";
  }
  const key = Object.keys(headers).find(item => item.toLowerCase() === name.toLowerCase());
  return key ? headers[key] : "";
}

function respond(res, data, status = 200) {
  return res.json(data, status);
}

async function verifyFirebaseUser(req) {
  const authorization = headerValue(req.headers, "x-firebase-authorization");
  const match = /^Bearer\s+([^\s]+)$/i.exec(authorization);
  if (!match) throw Object.assign(new Error("Sign in required. Please sign in to Railway Mitra."), { status: 401 });
  const token = match[1];
  if (token.split(".").length !== 3) throw Object.assign(new Error("Session token format is invalid. Please sign in again."), { status: 401 });

  try {
    const { payload } = await jwtVerify(token, jwks, {
      issuer: `https://securetoken.google.com/${FIREBASE_PROJECT_ID}`,
      audience: FIREBASE_PROJECT_ID,
      algorithms: ["RS256"]
    });
    if (typeof payload.sub !== "string" || payload.sub.length < 1 || payload.sub.length > 128) throw new Error("Invalid subject");
    return payload.sub;
  } catch {
    throw Object.assign(new Error("Session invalid or expired. Please sign in again."), { status: 401 });
  }
}

async function appwriteRequest(path, options = {}) {
  const key = process.env.APPWRITE_API_KEY;
  if (!key) throw new Error("Backend configuration is incomplete.");
  const response = await fetch(`${APPWRITE_ENDPOINT}${path}`, {
    ...options,
    headers: {
      "X-Appwrite-Project": PROJECT_ID,
      "X-Appwrite-Key": key,
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });
  const raw = await response.text();
  let data;
  try { data = raw ? JSON.parse(raw) : {}; } catch { data = {}; }
  if (!response.ok) {
    const err = new Error(data.message || "Database request failed.");
    err.status = response.status >= 500 ? 502 : response.status;
    throw err;
  }
  return data;
}

function readBody(req) {
  if (req.bodyJson && typeof req.bodyJson === "object") return req.bodyJson;
  if (typeof req.body === "object" && req.body) return req.body;
  try { return JSON.parse(req.bodyRaw || "{}"); } catch { return {}; }
}

export default async ({ req, res, log, error }) => {
  if (req.method === "OPTIONS") return res.empty(204);
  if (req.method !== "POST") return respond(res, { error: "Method not allowed." }, 405);

  try {
    const uid = await verifyFirebaseUser(req);
    const body = readBody(req);

    if (body.action === "submit") {
      const station = ROUTE.find(item => item.id === String(body.stationId ?? ""));
      const { direction, movement, trainType } = body;
      if (!station) return respond(res, { error: "Choose a valid route station." }, 400);
      if (!["UP", "DOWN"].includes(direction)) return respond(res, { error: "Invalid direction." }, 400);
      if (!["pass", "halt", "departure"].includes(movement)) return respond(res, { error: "Invalid movement type." }, 400);
      if (!Object.hasOwn(SPEEDS, trainType)) return respond(res, { error: "Invalid train type." }, 400);

      let departureKm = null;
      if (movement === "departure") {
        departureKm = Number(body.departureKm);
        if (!Number.isFinite(departureKm) || departureKm < 0 || departureKm > 158 || Math.abs(departureKm - station.km) > 5) {
          return respond(res, { error: "Departure KM must be within 5 km of the selected station." }, 400);
        }
      } else if (body.departureKm !== undefined && body.departureKm !== null) {
        return respond(res, { error: "Departure KM is only allowed for departure reports." }, 400);
      }

      const createdAtMs = Date.now();
      const reportId = randomUUID().replaceAll("-", "").slice(0, 32);
      await appwriteRequest(`/tablesdb/${DATABASE_ID}/tables/${TABLE_ID}/rows`, {
        method: "POST",
        body: JSON.stringify({
          rowId: reportId,
          data: {
            uid, routeId: ROUTE_ID, stationId: station.id, stationName: station.name,
            stationKm: station.km, direction, movement, trainType,
            speedKmh: SPEEDS[trainType],
            movementLabel: movement === "pass" ? "Passed without stop" : movement === "halt" ? "Halted" : "Departed",
            departureKm, createdAtMs, schemaVersion: 2
          },
          permissions: []
        })
      });
      return respond(res, { success: true, reportId, speedKmh: SPEEDS[trainType], createdAtMs });
    }

    if (body.action === "list") {
      const requested = Number(body.limit);
      const limit = Number.isFinite(requested) ? Math.min(50, Math.max(1, Math.floor(requested))) : 30;
      const queries = [
        { method: "equal", attribute: "routeId", values: [ROUTE_ID] },
        { method: "orderDesc", attribute: "createdAtMs" },
        { method: "limit", values: [limit] }
      ];
      const params = new URLSearchParams();
      for (const query of queries) params.append("queries[]", JSON.stringify(query));
      params.set("total", "false");
      const result = await appwriteRequest(`/tablesdb/${DATABASE_ID}/tables/${TABLE_ID}/rows?${params.toString()}`, { method: "GET" });
      const reports = (result.rows || []).map(row => ({
        stationName: row.stationName,
        stationKm: row.stationKm,
        direction: row.direction,
        movement: row.movement,
        movementLabel: row.movementLabel,
        trainType: row.trainType,
        speedKmh: row.speedKmh,
        departureKm: row.departureKm,
        createdAt: row.createdAtMs
      }));
      return respond(res, { reports });
    }

    return respond(res, { error: "Unknown action." }, 400);
  } catch (err) {
    if (err.status === 401) return respond(res, { error: err.message }, 401);
    error?.(err);
    log?.("Train movement API request failed.");
    return respond(res, { error: err.status && err.status < 500 ? err.message : "Unable to process the report right now." }, err.status || 500);
  }
};
