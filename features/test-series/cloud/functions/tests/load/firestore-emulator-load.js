"use strict";

// Safety guard: this harness must never connect to a remote Firestore project.
const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST || "";
if (!/^(127\.0\.0\.1|localhost|\[::1\]):8080$/.test(emulatorHost)) {
  console.error("Refusing to run: set FIRESTORE_EMULATOR_HOST to a local Firestore Emulator (127.0.0.1:8080).");
  process.exit(1);
}

const { randomUUID } = require("node:crypto");
const { initializeApp, deleteApp } = require("firebase-admin/app");
const { getFirestore, Timestamp, FieldValue } = require("firebase-admin/firestore");

const PROJECT_ID = process.env.GCLOUD_PROJECT || "demo-railway-mitra-load";
const STUDENTS = boundedInt(process.env.LOAD_STUDENTS, 500, 1, 500);
const WAVES = boundedInt(process.env.LOAD_WAVES, 5, 1, 20);
const QUESTIONS = boundedInt(process.env.LOAD_QUESTIONS, 50, 1, 500);
const CONCURRENCY = boundedInt(process.env.LOAD_CONCURRENCY, STUDENTS, 1, STUDENTS);
const RUN_ID = randomUUID().replace(/-/g, "");
const PREFIX = "testSeriesLoadTestRuns/" + RUN_ID;

function boundedInt(raw, fallback, min, max) {
  const value = raw === undefined ? fallback : Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) {
    console.error("Invalid load-test setting. Expected integer from " + min + " to " + max + ".");
    process.exit(1);
  }
  return value;
}

function percentile(values, p) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return Number(sorted[Math.min(sorted.length - 1, Math.ceil(p * sorted.length) - 1)].toFixed(2));
}

async function runPool(items, limit, worker) {
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const index = cursor++;
      if (index >= items.length) return;
      await worker(items[index], index);
    }
  });
  await Promise.all(workers);
}

async function main() {
  const app = initializeApp({ projectId: PROJECT_ID }, "rm-load-" + RUN_ID);
  const db = getFirestore(app);
  const questionSetRef = db.doc(PREFIX + "/fixtures/questionSet");
  const attemptRefs = Array.from({ length: STUDENTS }, (_, i) =>
    db.doc(PREFIX + "/attempts/student-" + String(i + 1).padStart(4, "0")));
  const expiresAt = Timestamp.fromDate(new Date(Date.now() + 60 * 60 * 1000));
  const questionRows = Array.from({ length: QUESTIONS }, (_, i) => ({
    id: "q" + String(i + 1).padStart(3, "0"),
    text: "Load test question " + (i + 1),
    options: ["A", "B", "C", "D"]
  }));
  const timings = [];
  let failures = 0;
  const startedAt = Date.now();

  console.log("Railway Mitra emulator-only Firestore workload");
  console.log(JSON.stringify({ emulatorHost, projectId: PROJECT_ID, students: STUDENTS, waves: WAVES, questions: QUESTIONS, concurrency: CONCURRENCY, writes: STUDENTS * WAVES * QUESTIONS }));

  try {
    await questionSetRef.set({ questions: questionRows });
    for (let offset = 0; offset < attemptRefs.length; offset += 450) {
      const batch = db.batch();
      attemptRefs.slice(offset, offset + 450).forEach((ref, localIndex) => {
        const studentIndex = offset + localIndex;
        batch.create(ref, {
          uid: "load-student-" + studentIndex,
          testId: RUN_ID,
          status: "in_progress",
          expiresAt,
          answers: {},
          createdAt: FieldValue.serverTimestamp()
        });
      });
      await batch.commit();
    }

    for (let wave = 0; wave < WAVES; wave++) {
      const waveStarted = Date.now();
      await runPool(attemptRefs, CONCURRENCY, async (attemptRef, studentIndex) => {
        // Each synthetic student saves every question in the paper, not just one
        // answer per wave. Saves for one student are sequential; students run concurrently.
        for (let questionIndex = 0; questionIndex < questionRows.length; questionIndex++) {
          const question = questionRows[questionIndex];
          const began = Date.now();
          try {
            await db.runTransaction(async tx => {
              const [attemptSnap, questionSnap] = await Promise.all([
                tx.get(attemptRef),
                tx.get(questionSetRef)
              ]);
              if (!attemptSnap.exists) throw new Error("Attempt fixture missing");
              const attempt = attemptSnap.data();
              if (attempt.status !== "in_progress" || attempt.expiresAt.toMillis() <= Date.now()) {
                throw new Error("Attempt is not writable");
              }
              const exists = (questionSnap.data()?.questions || []).some(item => item.id === question.id);
              if (!exists) throw new Error("Question is not in the paper");
              tx.update(attemptRef, {
                ["answers." + question.id]: String((studentIndex + questionIndex + wave) % 4),
                updatedAt: FieldValue.serverTimestamp()
              });
            });
          } catch (error) {
            failures++;
            console.error("Save failed", { studentIndex, questionId: question.id, wave, code: error.code || null, message: error.message });
          } finally {
            timings.push(Date.now() - began);
          }
        }
      });
      console.log(JSON.stringify({ wave: wave + 1, elapsedMs: Date.now() - waveStarted, completedSaves: timings.length, failures }));
    }

    const elapsedMs = Date.now() - startedAt;
    const successful = timings.length - failures;
    console.log("LOAD_TEST_RESULT " + JSON.stringify({
      runId: RUN_ID,
      students: STUDENTS,
      waves: WAVES,
      questionsPerStudentPerWave: QUESTIONS,
      totalSaveAttempts: timings.length,
      successfulSaves: successful,
      failures,
      elapsedMs,
      savesPerSecond: Number((successful / (elapsedMs / 1000)).toFixed(2)),
      latencyMs: { p50: percentile(timings, 0.50), p95: percentile(timings, 0.95), p99: percentile(timings, 0.99), max: Math.max(0, ...timings) },
      note: "Firestore Emulator measurements are not production capacity or latency guarantees."
    }));
    if (failures) process.exitCode = 1;
  } finally {
    for (let offset = 0; offset < attemptRefs.length; offset += 450) {
      const batch = db.batch();
      attemptRefs.slice(offset, offset + 450).forEach(ref => batch.delete(ref));
      await batch.commit().catch(error => console.error("Cleanup batch failed", error.message));
    }
    await questionSetRef.delete().catch(error => console.error("Fixture cleanup failed", error.message));
    await deleteApp(app);
  }
}

main().catch(error => {
  console.error("Load test failed", error);
  process.exitCode = 1;
});
