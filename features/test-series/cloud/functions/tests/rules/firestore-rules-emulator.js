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
  "testSeriesQuestionMedia",
  "testSeriesPaymentRequests",
  "testSeriesPaymentLocks",
  "testSeriesPaymentOrders",
  "testSeriesPayments",
  "testSeriesPaymentEvents",
  "testSeriesPaymentAudit",
  "testSeriesRefunds",
  "testSeriesManualAccess",
  "testSeriesAccessAudit",
  "testSeriesAccessRequests"
];

// Probe a document below every protected root to ensure recursive matches keep
// future private subcollections client-denied as well.
const nestedProtectedDocuments = protectedCollections.map(
  collection => `${collection}/rules-probe/private/child`
);

const nestedProtectedCollections = protectedCollections.map(
  collection => `${collection}/rules-probe/private`
);

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

function createWrite(path, value) {
  return {
    ...updateWrite(path, value),
    currentDocument: { exists: false }
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

  for (const collection of ["testSeriesManualAccess", "testSeriesAccessAudit", "testSeriesAccessRequests"]) {
    await expectDenied(`unauthenticated write to ${collection}`, `${base}:commit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ writes: [updateWrite(`${collection}/rules-probe`, "must-be-denied")] })
    });
  }

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

  for (const collection of protectedCollections) {
    await expectDenied(`authenticated user cannot write ${collection}`, `${base}:commit`, {
      method: "POST",
      headers: { ...auth(userA.token), "Content-Type": "application/json" },
      body: JSON.stringify({ writes: [updateWrite(`${collection}/rules-probe`, "must-be-denied")] })
    });
  }
  await expectDenied("authenticated user cannot read unlisted collection", `${base}/unlistedCollection/rules-probe`, {
    headers: auth(userA.token)
  });

  // Root-document denial is not enough: future subcollections under protected
  // records must remain inaccessible to both anonymous and signed-in clients.
  for (const documentPath of nestedProtectedDocuments) {
    await expectDenied(`unauthenticated read of nested ${documentPath}`, `${base}/${documentPath}`);
    await expectDenied(`unauthenticated write to nested ${documentPath}`, `${base}:commit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ writes: [updateWrite(documentPath, "must-be-denied")] })
    });
  }

  for (let index = 0; index < nestedProtectedDocuments.length; index += 1) {
    const documentPath = nestedProtectedDocuments[index];
    const collectionPath = nestedProtectedCollections[index];

    await expectDenied(`authenticated user cannot read nested ${documentPath}`, `${base}/${documentPath}`, {
      headers: auth(userA.token)
    });
    await expectDenied(`authenticated user cannot write nested ${documentPath}`, `${base}:commit`, {
      method: "POST",
      headers: { ...auth(userA.token), "Content-Type": "application/json" },
      body: JSON.stringify({ writes: [updateWrite(documentPath, "must-be-denied")] })
    });

    // Exercise create-only preconditions separately from update denials.
    await expectDenied(`unauthenticated client cannot create nested ${documentPath}`, `${base}:commit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ writes: [createWrite(documentPath, "must-be-denied")] })
    });
    await expectDenied(`authenticated client cannot create nested ${documentPath}`, `${base}:commit`, {
      method: "POST",
      headers: { ...auth(userA.token), "Content-Type": "application/json" },
      body: JSON.stringify({ writes: [createWrite(documentPath, "must-be-denied")] })
    });

    // A get denial does not exercise the collection-list/query endpoint.
    await expectDenied(`unauthenticated client cannot list nested ${collectionPath}`, `${base}/${collectionPath}?pageSize=1`);
    await expectDenied(`authenticated client cannot list nested ${collectionPath}`, `${base}/${collectionPath}?pageSize=1`, {
      headers: auth(userA.token)
    });
  }

  const checks = protectedCollections.length * 3 + nestedProtectedDocuments.length * 8 + 16;
  console.log("RULES_TEST_RESULT", JSON.stringify({ projectId, checks, result: "passed" }));
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
