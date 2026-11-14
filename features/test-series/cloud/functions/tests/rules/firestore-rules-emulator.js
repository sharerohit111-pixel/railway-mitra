const projectId = process.env.GCLOUD_PROJECT || "demo-railway-mitra-rules";
const host = process.env.FIRESTORE_EMULATOR_HOST || "127.0.0.1:8080";
const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST || "127.0.0.1:9099";
const base = `http://${host}/v1/projects/${projectId}/databases/(default)/documents`;
const protectedCollections = [
  "testSeriesTests",
  "testSeriesAnswerKeys",
  "testSeriesAttempts",
  "testSeriesActiveSessions",
  "testSeriesResults",
  "testSeriesEntitlements",
  "testSeriesFreeAttempts",
  "testSeriesConfig",
  "testSeriesQuestionBank",
  "testSeriesQuestionSets",
  "testSeriesPaymentRequests",
  "testSeriesPaymentLocks",
  "testSeriesPaymentOrders",
  "testSeriesPayments",
  "testSeriesPaymentEvents",
  "testSeriesPaymentAudit"
];

async function expectStatus(label, response, expected) {
  if (response.status !== expected) {
    const body = await response.text();
    throw new Error(`${label}: expected HTTP ${expected}, received ${response.status}: ${body.slice(0, 500)}`);
  }
  console.log(`PASS ${label} (HTTP ${expected})`);
}

async function expectDenied(label, url, options = {}) {
  await expectStatus(label, await fetch(url, options), 403);
}

async function createTestUser(email) {
  const response = await fetch(`http://${authHost}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "TestOnly-Password-123!", returnSecureToken: true })
  });
  if (!response.ok) {
    throw new Error(`Auth Emulator signup failed (${response.status}): ${(await response.text()).slice(0, 500)}`);
  }
  const payload = await response.json();
  if (!payload.localId || !payload.idToken) throw new Error("Auth Emulator did not return uid and ID token");
  return { uid: payload.localId, token: payload.idToken };
}

function auth(token) {
  return { Authorization: `Bearer ${token}` };
}

async function commit(token, writes) {
  return fetch(`${base}:commit`, {
    method: "POST",
    headers: { ...auth(token), "Content-Type": "application/json" },
    body: JSON.stringify({ writes })
  });
}

function updateWrite(path, value) {
  return {
    update: {
      name: `projects/${projectId}/databases/(default)/documents/${path}`,
      fields: { probe: { stringValue: value } }
    }
  };
}

async function main() {
  if (!process.env.FIRESTORE_EMULATOR_HOST) {
    throw new Error("FIRESTORE_EMULATOR_HOST must point to the local Firestore Emulator");
  }
  if (!process.env.FIREBASE_AUTH_EMULATOR_HOST) {
    throw new Error("FIREBASE_AUTH_EMULATOR_HOST must point to the local Auth Emulator");
  }

  // Anonymous requests must be denied from all private Test Series collections.
  for (const collection of protectedCollections) {
    await expectDenied(`unauthenticated read of ${collection}`, `${base}/${collection}/rules-probe`);
  }
  await expectDenied("unauthenticated read of an unlisted collection (default deny)", `${base}/unlistedCollection/rules-probe`);
  await expectDenied("unauthenticated write to Test Series answer keys", `${base}:commit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ writes: [updateWrite("testSeriesAnswerKeys/rules-probe", "must-be-denied")] })
  });

  // Create two real Auth Emulator users and verify ownership boundaries.
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const userA = await createTestUser(`rules-a-${suffix}@example.test`);
  const userB = await createTestUser(`rules-b-${suffix}@example.test`);

  await expectStatus("user A can create own duty diary entry", await commit(userA.token, [
    updateWrite(`users/${userA.uid}/dutyDiary/2026-11-13`, "own-duty-diary")
  ]), 200);
  await expectStatus("user A can read own duty diary entry", await fetch(
    `${base}/users/${userA.uid}/dutyDiary/2026-11-13`, { headers: auth(userA.token) }
  ), 200);
  await expectDenied("user A cannot read user B duty diary", `${base}/users/${userB.uid}/dutyDiary/2026-11-13`, {
    headers: auth(userA.token)
  });
  await expectDenied("user A cannot write user B duty diary", `${base}:commit`, {
    method: "POST",
    headers: { ...auth(userA.token), "Content-Type": "application/json" },
    body: JSON.stringify({ writes: [updateWrite(`users/${userB.uid}/dutyDiary/2026-11-13`, "cross-user-write")] })
  });
  await expectStatus("user A can update own duty diary entry", await commit(userA.token, [
    updateWrite(`users/${userA.uid}/dutyDiary/2026-11-13`, "updated-own-duty-diary")
  ]), 200);

  await expectStatus("user A can create own main employee profile", await commit(userA.token, [
    updateWrite(`users/${userA.uid}/employeeProfile/main`, "own-profile")
  ]), 200);
  await expectStatus("user A can update own main employee profile", await commit(userA.token, [
    updateWrite(`users/${userA.uid}/employeeProfile/main`, "updated-own-profile")
  ]), 200);
  await expectDenied("user A cannot read user B employee profile", `${base}/users/${userB.uid}/employeeProfile/main`, {
    headers: auth(userA.token)
  });
  await expectDenied("user A cannot write user B employee profile", `${base}:commit`, {
    method: "POST",
    headers: { ...auth(userA.token), "Content-Type": "application/json" },
    body: JSON.stringify({ writes: [updateWrite(`users/${userB.uid}/employeeProfile/main`, "cross-user-profile-write")] })
  });
  await expectDenied("user A cannot write a non-main employee profile", `${base}:commit`, {
    method: "POST",
    headers: { ...auth(userA.token), "Content-Type": "application/json" },
    body: JSON.stringify({ writes: [updateWrite(`users/${userA.uid}/employeeProfile/other`, "not-allowed")] })
  });

  for (const collection of protectedCollections) {
    await expectDenied(`authenticated user cannot read ${collection}`, `${base}/${collection}/rules-probe`, {
      headers: auth(userA.token)
    });
  }
  await expectDenied("authenticated user cannot read unlisted collection", `${base}/unlistedCollection/rules-probe`, {
    headers: auth(userA.token)
  });

  const checks = protectedCollections.length * 2 + 13;
  console.log("RULES_TEST_RESULT", JSON.stringify({ projectId, checks, result: "passed" }));
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
