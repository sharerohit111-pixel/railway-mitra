"use strict";

// End-to-end callable load harness. It must only run against local emulators.
const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST || "";
const functionsHost = process.env.FUNCTIONS_EMULATOR_HOST || "127.0.0.1:5001";
const firestoreHost = process.env.FIRESTORE_EMULATOR_HOST || "";
if (!/^(127\\.0\\.0\\.1|localhost):9099$/.test(authHost) ||
    !/^(127\\.0\\.0\\.1|localhost):8080$/.test(firestoreHost) ||
    !/^(127\\.0\\.0\\.1|localhost):5001$/.test(functionsHost)) {
  console.error("Refusing to run: Auth, Firestore and Functions must all use local emulator hosts.");
  process.exit(1);
}

const { randomUUID } = require("node:crypto");
const { initializeApp, deleteApp } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");

const PROJECT = process.env.GCLOUD_PROJECT || "railway-mitra";
const STUDENTS = boundedInt(process.env.CALLABLE_LOAD_STUDENTS, 20, 1, 100);
const CONCURRENCY = boundedInt(process.env.CALLABLE_LOAD_CONCURRENCY, 10, 1, STUDENTS);
const QUESTIONS = boundedInt(process.env.CALLABLE_LOAD_QUESTIONS, 50, 1, 100);
const RUN = randomUUID().replace(/-/g, "");
const TEST_ID = "callable-load-" + RUN;
const REGION = "asia-south1";
const latencies = { start: [], save: [], submit: [] };
let failures = 0;

function boundedInt(raw, fallback, min, max) {
  const n = raw === undefined ? fallback : Number(raw);
  if (!Number.isInteger(n) || n < min || n > max) {
    console.error("Invalid callable load setting; expected integer " + min + "–" + max);
    process.exit(1);
  }
  return n;
}
function percentile(values, p) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return Number(sorted[Math.min(sorted.length - 1, Math.ceil(p * sorted.length) - 1)].toFixed(1));
}
async function pool(items, limit, worker) {
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      await worker(items[i], i);
    }
  }));
}
async function timedCall(name, token, data, samples) {
  const started = Date.now();
  const response = await fetch("http://" + functionsHost + "/" + PROJECT + "/" + REGION + "/" + name, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: "Bearer " + token },
    body: JSON.stringify({ data })
  });
  const body = await response.json().catch(() => ({}));
  samples.push(Date.now() - started);
  if (!response.ok || body.error) {
    const message = body.error && body.error.message || ("HTTP " + response.status);
    throw new Error(name + " failed: " + message);
  }
  if (!Object.prototype.hasOwnProperty.call(body, "result")) {
    throw new Error(name + " returned no callable result envelope");
  }
  return body.result;
}
async function main() {
  const app = initializeApp({ projectId: PROJECT }, "rm-callable-load-" + RUN);
  const auth = getAuth(app);
  const db = getFirestore(app);
  const students = [];
  const attemptIds = [];
  const authUrl = "http://" + authHost + "/identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=fake-api-key";
  const questionRows = Array.from({ length: QUESTIONS }, (_, i) => ({
    id: "q" + String(i + 1).padStart(3, "0"),
    text: "Callable load question " + (i + 1),
    options: ["Option A", "Option B", "Option C", "Option D"]
  }));
  console.log("Railway Mitra authenticated callable emulator workload");
  console.log(JSON.stringify({ projectId: PROJECT, students: STUDENTS, concurrency: CONCURRENCY, questionsPerStudent: QUESTIONS, expectedAnswerCalls: STUDENTS * QUESTIONS }));

  try {
    await db.doc("testSeriesTests/" + TEST_ID).set({
      title: "Callable Load " + RUN, status: "published", price: 1,
      mode: "mock", durationMinutes: 60, marksPerQuestion: 1, negativeMarks: 0.25,
      questionCount: QUESTIONS, updatedAt: FieldValue.serverTimestamp()
    });
    await db.doc("testSeriesQuestionSets/" + TEST_ID).set({ questions: questionRows });
    const answerKey = {};
    questionRows.forEach(q => { answerKey[q.id] = { correctAnswer: "0" }; });
    await db.doc("testSeriesAnswerKeys/" + TEST_ID).set({ questions: answerKey });

    // Provision independent emulator identities and exchange custom tokens for Auth ID tokens.
    for (let i = 0; i < STUDENTS; i++) {
      const user = await auth.createUser({ phoneNumber: "+1555" + String(1000000 + i).slice(-7) });
      students.push({ uid: user.uid, token: null, attemptId: null });
    }
    await pool(students, CONCURRENCY, async student => {
      const customToken = await auth.createCustomToken(student.uid);
      const response = await fetch(authUrl, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ token: customToken, returnSecureToken: true })
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body.idToken) throw new Error("Auth Emulator token exchange failed: " + JSON.stringify(body));
      student.token = body.idToken;
      await db.doc("testSeriesEntitlements/" + student.uid + "_" + TEST_ID).set({
        uid: student.uid, testId: TEST_ID, status: "active", grantedAt: FieldValue.serverTimestamp()
      });
    });

    const startedAt = Date.now();
    await pool(students, CONCURRENCY, async student => {
      try {
        const result = await timedCall("rmStartExam", student.token, { testId: TEST_ID }, latencies.start);
        if (!result.attemptId || result.resumed) throw new Error("Unexpected start response");
        student.attemptId = result.attemptId;
        attemptIds.push(result.attemptId);
      } catch (error) { failures++; console.error(error.message); }
    });

    await pool(students.filter(s => s.attemptId), CONCURRENCY, async student => {
      for (const question of questionRows) {
        try {
          const result = await timedCall("rmSaveAnswer", student.token, {
            attemptId: student.attemptId, questionId: question.id, answer: "0"
          }, latencies.save);
          if (!result.saved) throw new Error("Answer save not acknowledged");
        } catch (error) { failures++; console.error(error.message); }
      }
      try {
        const result = await timedCall("rmSubmitExam", student.token, { attemptId: student.attemptId }, latencies.submit);
        if (!result.submitted || result.correct !== QUESTIONS) throw new Error("Server-side scoring mismatch");
      } catch (error) { failures++; console.error(error.message); }
    });

    const totalCalls = latencies.start.length + latencies.save.length + latencies.submit.length;
    const elapsedMs = Date.now() - startedAt;
    console.log("CALLABLE_LOAD_RESULT " + JSON.stringify({
      students: STUDENTS, concurrency: CONCURRENCY, questionsPerStudent: QUESTIONS,
      startCalls: latencies.start.length, answerSaveCalls: latencies.save.length,
      submitCalls: latencies.submit.length, totalCallableCalls: totalCalls, failures,
      elapsedMs, callsPerSecond: Number((totalCalls / (elapsedMs / 1000)).toFixed(2)),
      latencyMs: Object.fromEntries(Object.entries(latencies).map(([key, values]) => [key, {
        count: values.length, p50: percentile(values, 0.50), p95: percentile(values, 0.95),
        p99: percentile(values, 0.99), max: values.length ? Math.max(...values) : 0
      }])),
      note: "Local Auth/Functions/Firestore Emulator only; no App Check attestation, production network, or production capacity guarantee."
    }));
    if (failures || attemptIds.length !== STUDENTS) process.exitCode = 1;
  } finally {
    for (const collection of ["testSeriesEntitlements", "testSeriesAttempts", "testSeriesResults", "testSeriesActiveSessions"]) {
      const refs = collection === "testSeriesActiveSessions"
        ? students.map(s => db.doc(collection + "/" + s.uid))
        : collection === "testSeriesEntitlements"
          ? students.map(s => db.doc(collection + "/" + s.uid + "_" + TEST_ID))
          : attemptIds.map(id => db.doc(collection + "/" + id));
      for (let i = 0; i < refs.length; i += 400) {
        const batch = db.batch();
        refs.slice(i, i + 400).forEach(ref => batch.delete(ref));
        if (refs.length) await batch.commit().catch(error => console.error("Cleanup failed:", error.message));
      }
    }
    for (const student of students) await auth.deleteUser(student.uid).catch(() => {});
    await db.doc("testSeriesTests/" + TEST_ID).delete().catch(() => {});
    await db.doc("testSeriesQuestionSets/" + TEST_ID).delete().catch(() => {});
    await db.doc("testSeriesAnswerKeys/" + TEST_ID).delete().catch(() => {});
    await deleteApp(app);
  }
}
main().catch(error => { console.error("Callable load failed", error); process.exitCode = 1; });
