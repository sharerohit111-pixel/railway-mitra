/**
 * Persists a fail-closed student logout marker across reloads.
 * This is UI recovery only; Firebase Auth and callable authorization remain authoritative.
 */
export function createStudentLogoutRecovery(storageProvider) {
  const key = "railway-mitra.student.pending-signout.uid.v1";
  let memoryBlockedUid = null;

  function storage() {
    try {
      return typeof storageProvider === "function" ? storageProvider() : null;
    } catch (_) {
      return null;
    }
  }

  function clearMarker() {
    memoryBlockedUid = null;
    const target = storage();
    if (!target) return false;

    // Prefer removing the key, but verify the result: some restricted storage
    // implementations can throw or silently refuse removeItem(). An empty
    // tombstone is safe because block() never accepts an empty UID and readUid()
    // treats an empty stored value as no pending marker.
    try {
      target.removeItem(key);
      if (target.getItem(key) == null) return true;
    } catch (_) {
      // Try the verified tombstone fallback below.
    }

    try {
      target.setItem(key, "");
      return target.getItem(key) === "";
    } catch (_) {
      return false;
    }
  }

  function readUid() {
    const target = storage();
    if (!target) return memoryBlockedUid;
    try {
      return target.getItem(key) || memoryBlockedUid;
    } catch (_) {
      return memoryBlockedUid;
    }
  }

  return Object.freeze({
    block(uid) {
      if (typeof uid !== "string" || !uid.trim()) return false;
      memoryBlockedUid = uid;
      const target = storage();
      if (!target) return false;
      try {
        target.setItem(key, uid);
        return target.getItem(key) === uid;
      } catch (_) {
        return false;
      }
    },
    shouldBlock(uid) {
      const blockedUid = readUid();
      if (!blockedUid) return false;
      if (blockedUid === uid) return true;
      clearMarker();
      return false;
    },
    clear() {
      return clearMarker();
    }
  });
}
