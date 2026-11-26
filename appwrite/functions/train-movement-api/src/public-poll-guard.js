/**
 * Best-effort per-process public feed throttle.
 * Prefer Appwrite's gateway-supplied client IP; fail closed when no IP is available.
 * This is not a distributed rate limiter and must not be described as one.
 */
function headerValue(req, name) {
  const headers = req?.headers;
  if (Array.isArray(headers)) {
    const item = headers.find(entry => String(entry?.name || "").toLowerCase() === name.toLowerCase());
    return item?.value == null ? "" : String(item.value).trim();
  }
  if (headers && typeof headers === "object") {
    const key = Object.keys(headers).find(candidate => candidate.toLowerCase() === name.toLowerCase());
    const value = key ? headers[key] : "";
    return Array.isArray(value) ? String(value[0] || "").trim() : String(value || "").trim();
  }
  return "";
}

export function createPublicPollGuard({ windowMs = 5000, maxEntries = 1000, staleAfterMs = 60000 } = {}) {
  const lastPollByIp = new Map();

  return {
    allow(req, now = Date.now()) {
      if (!Number.isFinite(now) || now < 0) return false;

      // This header is injected by Appwrite and is present in observed production executions.
      const appwriteIp = headerValue(req, "x-appwrite-client-ip");
      const forwardedIp = headerValue(req, "x-forwarded-for")
        || headerValue(req, "x-real-ip")
        || headerValue(req, "cf-connecting-ip");
      const ip = (appwriteIp || forwardedIp).split(",")[0].trim().toLowerCase();
      if (!ip) return false;

      const previous = lastPollByIp.get(ip);
      if (previous !== undefined && (now < previous || now - previous < windowMs)) return false;

      lastPollByIp.set(ip, now);
      if (lastPollByIp.size > maxEntries) {
        for (const [key, timestamp] of lastPollByIp) {
          if (now - timestamp > staleAfterMs) lastPollByIp.delete(key);
        }
        while (lastPollByIp.size > maxEntries) {
          const oldestKey = lastPollByIp.keys().next().value;
          if (oldestKey === undefined) break;
          lastPollByIp.delete(oldestKey);
        }
      }
      return true;
    }
  };
}
