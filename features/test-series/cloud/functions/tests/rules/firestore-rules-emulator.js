const projectId = process.env.GCLOUD_PROJECT || "demo-railway-mitra-rules";
const host = process.env.FIRESTORE_EMULATOR_HOST || "127.0.0.1:8080";
const base = `http://${host}/v1/projects/${projectId}/databases/(default)/documents`;

const protectedCollections = [
  "testSeriesTests",
  "testSeriesAnswerKeys",
  "testSeriesAttempts",
  "testSeriesActiveSessions",
  "testSeriesResults",
  "testSeriesEntitlements",
  "testSeriesFreeAttempts",
  "testSeriesConfig"
];

async function expectDenied(label, url, options = {}) {
  const response = await fetch(url, options);
  if (response.status !== 403) {
    const body = await response.text();
    throw new Error(`${label}: expected HTTP 403, received ${response.status}: ${body.slice(0, 500)}`);
  }
  console.log(`PASS denied: ${label} (HTTP 403)`);
}

async function main() {
  if (!process.env.FIRESTORE_EMULATOR_HOST) {
    throw new Error("FIRESTORE_EMULATOR_HOST must point to the local Firestore Emulator");
  }

  for (const collection of protectedCollections) {
    await expectDenied(
      `unauthenticated read of ${collection}`,
      `${base}/${collection}/rules-probe`
    );
  }

  await expectDenied(
    "unauthenticated read of an unlisted collection (default deny)",
    `${base}/unlistedCollection/rules-probe`
  );

  await expectDenied(
    "unauthenticated write to Test Series answer keys",
    `${base}:commit`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        writes: [{
          update: {
            name: `projects/${projectId}/databases/(default)/documents/testSeriesAnswerKeys/rules-probe`,
            fields: { probe: { stringValue: "must-be-denied" } }
          }
        }]
      })
    }
  );

  console.log("RULES_TEST_RESULT", JSON.stringify({
    projectId,
    checks: protectedCollections.length + 2,
    result: "passed"
  }));
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
