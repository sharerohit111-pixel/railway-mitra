import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createStudentAnswerSaveQueue } from "../answer-save-queue.mjs";

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

function signal() {
  let resolve;
  const promise = new Promise(res => { resolve = res; });
  return { promise, resolve };
}

test("coalesces identical in-flight saves for one question", async () => {
  const gate = deferred();
  const started = signal();
  const calls = [];
  const queue = createStudentAnswerSaveQueue({
    saveAnswer(questionId, value) {
      calls.push([questionId, value]);
      started.resolve();
      return gate.promise;
    }
  });

  const first = queue.queueSave("q1", "0");
  const duplicate = queue.queueSave("q1", "0");
  assert.equal(first, duplicate);
  await started.promise;
  assert.deepEqual(calls, [["q1", "0"]]);
  assert.equal(queue.pendingAnswers.get("q1"), "0");
  assert.equal(queue.hasInFlightSaves(), true);

  gate.resolve({ saved: true });
  await Promise.all([first, duplicate]);
  assert.equal(queue.pendingAnswers.size, 0);
  assert.equal(queue.hasInFlightSaves(), false);
});

test("serializes rapid changes and retains the newest answer until it is confirmed", async () => {
  const firstGate = deferred();
  const secondGate = deferred();
  const firstStarted = signal();
  const secondStarted = signal();
  const calls = [];
  const queue = createStudentAnswerSaveQueue({
    saveAnswer(questionId, value) {
      calls.push([questionId, value]);
      if (value === "0") {
        firstStarted.resolve();
        return firstGate.promise;
      }
      secondStarted.resolve();
      return secondGate.promise;
    }
  });

  const older = queue.queueSave("q1", "0");
  await firstStarted.promise;
  const latest = queue.queueSave("q1", "1");
  assert.equal(queue.pendingAnswers.get("q1"), "1");
  assert.deepEqual(calls, [["q1", "0"]]);

  firstGate.resolve();
  await older;
  await secondStarted.promise;
  assert.equal(queue.pendingAnswers.get("q1"), "1");
  assert.deepEqual(calls, [["q1", "0"], ["q1", "1"]]);

  secondGate.resolve();
  await latest;
  assert.equal(queue.pendingAnswers.size, 0);
});

test("a failed older save does not block a newer answer for the same question", async () => {
  const firstGate = deferred();
  const secondGate = deferred();
  const firstStarted = signal();
  const secondStarted = signal();
  const calls = [];
  const queue = createStudentAnswerSaveQueue({
    saveAnswer(questionId, value) {
      calls.push([questionId, value]);
      if (value === "0") {
        firstStarted.resolve();
        return firstGate.promise;
      }
      secondStarted.resolve();
      return secondGate.promise;
    }
  });

  const older = queue.queueSave("q1", "0");
  const olderRejected = assert.rejects(older, /network unavailable/);
  await firstStarted.promise;
  const latest = queue.queueSave("q1", "1");
  firstGate.reject(new Error("network unavailable"));
  await olderRejected;
  await secondStarted.promise;
  assert.equal(queue.pendingAnswers.get("q1"), "1");

  secondGate.resolve();
  await latest;
  assert.deepEqual(calls, [["q1", "0"], ["q1", "1"]]);
  assert.equal(queue.pendingAnswers.size, 0);
});

test("concurrent retry triggers share one retry pass", async () => {
  const initialGate = deferred();
  const retryGate = deferred();
  const initialStarted = signal();
  const retryStarted = signal();
  let calls = 0;
  const queue = createStudentAnswerSaveQueue({
    saveAnswer() {
      calls += 1;
      if (calls === 1) {
        initialStarted.resolve();
        return initialGate.promise;
      }
      retryStarted.resolve();
      return retryGate.promise;
    }
  });

  const initial = queue.queueSave("q1", "1");
  const initialRejected = assert.rejects(initial, /first attempt failed/);
  await initialStarted.promise;
  initialGate.reject(new Error("first attempt failed"));
  await initialRejected;

  const retryOne = queue.retryPending();
  const retryTwo = queue.retryPending();
  await retryStarted.promise;
  assert.equal(calls, 2);
  retryGate.resolve();
  await Promise.all([retryOne, retryTwo]);
  assert.equal(queue.pendingAnswers.size, 0);
});


test("retry drains a newer answer selected while the retry is in flight", async () => {
  const initialGate = deferred();
  const retryGate = deferred();
  const latestGate = deferred();
  const initialStarted = signal();
  const retryStarted = signal();
  const latestStarted = signal();
  const calls = [];
  const queue = createStudentAnswerSaveQueue({
    saveAnswer(questionId, value) {
      calls.push([questionId, value]);
      if (calls.length === 1) {
        initialStarted.resolve();
        return initialGate.promise;
      }
      if (value === "0") {
        retryStarted.resolve();
        return retryGate.promise;
      }
      latestStarted.resolve();
      return latestGate.promise;
    }
  });

  const initial = queue.queueSave("q1", "0");
  const initialRejected = assert.rejects(initial, /initial network failure/);
  await initialStarted.promise;
  initialGate.reject(new Error("initial network failure"));
  await initialRejected;

  const retry = queue.retryPending();
  await retryStarted.promise;
  const latest = queue.queueSave("q1", "1");

  retryGate.resolve({ saved: true });
  await latestStarted.promise;
  assert.deepEqual(calls, [["q1", "0"], ["q1", "0"], ["q1", "1"]]);
  assert.equal(queue.pendingAnswers.get("q1"), "1");

  latestGate.resolve({ saved: true });
  await Promise.all([retry, latest]);
  assert.equal(queue.pendingAnswers.size, 0);
});

test("queued writes that have not started are skipped after the controller is destroyed", async () => {
  const firstGate = deferred();
  const firstStarted = signal();
  const calls = [];
  const saved = [];
  let active = true;
  const queue = createStudentAnswerSaveQueue({
    isActive: () => active,
    saveAnswer(questionId, value) {
      calls.push([questionId, value]);
      firstStarted.resolve();
      return firstGate.promise;
    },
    onSaved(_pending, questionId) { saved.push(questionId); }
  });

  const first = queue.queueSave("q1", "0");
  await firstStarted.promise;
  const queued = queue.queueSave("q2", "1");
  active = false;
  firstGate.resolve();
  await Promise.all([first, queued]);

  assert.deepEqual(calls, [["q1", "0"]]);
  assert.deepEqual(saved, []);
  assert.equal(queue.pendingAnswers.has("q2"), true);
});

test("rejects invalid question IDs, answer values and queue configuration", async () => {
  assert.throws(() => createStudentAnswerSaveQueue(), /answer-save function/);
  const queue = createStudentAnswerSaveQueue({ saveAnswer() {} });
  await assert.rejects(queue.queueSave("", "0"), /question ID/);
  await assert.rejects(queue.queueSave("q1", 0), /question ID/);
});

test("exam controller uses the isolated answer-save queue for retry, submit and unload", () => {
  const source = readFileSync(new URL("../exam.js", import.meta.url), "utf8");
  assert.match(source, /import \{ createStudentAnswerSaveQueue \} from "\.\/answer-save-queue\.mjs"/);
  assert.match(source, /const answerSaveQueue = createStudentAnswerSaveQueue\(/);
  assert.match(source, /const pendingAnswers = answerSaveQueue\.pendingAnswers/);
  assert.match(source, /answerSaveQueue\.waitForSaves\(\)\.catch\(\(\)\s*=>\s*\{\}\)/);
  assert.match(source, /answerSaveQueue\.hasInFlightSaves\(\)/);
  assert.match(source, /const retryPending = answerSaveQueue\.retryPending/);
});

test("an older same-value acknowledgement cannot clear a newer A-B-A selection", async () => {
  const firstGate = deferred();
  const middleGate = deferred();
  const latestGate = deferred();
  const firstStarted = signal();
  const middleStarted = signal();
  const latestStarted = signal();
  const calls = [];
  const savedSnapshots = [];
  const queue = createStudentAnswerSaveQueue({
    saveAnswer(questionId, value) {
      calls.push([questionId, value]);
      if (calls.length === 1) {
        firstStarted.resolve();
        return firstGate.promise;
      }
      if (calls.length === 2) {
        middleStarted.resolve();
        return middleGate.promise;
      }
      latestStarted.resolve();
      return latestGate.promise;
    },
    onSaved(pending) {
      savedSnapshots.push([...pending.entries()]);
    }
  });

  const first = queue.queueSave("q1", "0");
  await firstStarted.promise;
  const middle = queue.queueSave("q1", "1");
  const middleRejected = assert.rejects(middle, /intermediate save failed/);
  const latest = queue.queueSave("q1", "0");
  assert.equal(queue.pendingAnswers.get("q1"), "0");

  firstGate.resolve({ saved: true });
  await first;
  await middleStarted.promise;
  assert.equal(
    queue.pendingAnswers.get("q1"),
    "0",
    "the first A acknowledgement must not clear the later A queued behind B"
  );
  assert.deepEqual(savedSnapshots, [[["q1", "0"]]]);

  middleGate.reject(new Error("intermediate save failed"));
  await middleRejected;
  await latestStarted.promise;
  assert.equal(queue.pendingAnswers.get("q1"), "0",
    "a failed intermediate write must leave the latest selection recoverable");

  latestGate.resolve({ saved: true });
  await latest;
  assert.equal(queue.pendingAnswers.size, 0);
  assert.deepEqual(savedSnapshots, [[["q1", "0"]], []]);
  assert.deepEqual(calls, [["q1", "0"], ["q1", "1"], ["q1", "0"]]);
});
