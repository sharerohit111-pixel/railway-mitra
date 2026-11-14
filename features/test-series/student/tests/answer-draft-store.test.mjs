import test from "node:test";
import assert from "node:assert/strict";
import { readPendingAnswerDraft, writePendingAnswerDraft } from "../answer-draft-store.mjs";

function makeStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    values,
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); }
  };
}

const questions = [
  { id: "q1", options: ["A", "B", "C", "D"] },
  { id: "q2", options: ["True", "False"] }
];

test("writes and restores valid pending answers for the exact attempt key", () => {
  const storage = makeStorage();
  const key = "rm-cbt-pending:app:test:attempt";
  assert.equal(writePendingAnswerDraft({ storage, key, entries: [["q1", "2"], ["q2", "1"]] }), true);
  const restored = readPendingAnswerDraft({ storage, key, questions });
  assert.deepEqual([...restored.answers], [["q1", "2"], ["q2", "1"]]);
  assert.equal(restored.discarded, 0);
  assert.equal(restored.unavailable, false);
});

test("rejects coercible values, unknown questions and out-of-range option indexes", () => {
  const key = "draft";
  const storage = makeStorage({
    [key]: JSON.stringify([
      ["q1", "0"],
      ["q1", null],
      ["q1", false],
      ["q1", []],
      ["q1", {}],
      ["q1", "4"],
      ["q1", "-1"],
      ["q1", "1.0"],
      ["missing", "0"],
      [null, "0"],
      ["q2", "1"]
    ])
  });
  const restored = readPendingAnswerDraft({ storage, key, questions });
  assert.deepEqual([...restored.answers], [["q1", "0"], ["q2", "1"]]);
  assert.equal(restored.discarded, 9);
});

test("removes malformed JSON and malformed top-level payloads", () => {
  for (const raw of ["{broken", JSON.stringify({ q1: "1" })]) {
    const storage = makeStorage({ draft: raw });
    const restored = readPendingAnswerDraft({ storage, key: "draft", questions });
    assert.equal(restored.answers.size, 0);
    assert.equal(restored.discarded, 1);
    assert.equal(storage.getItem("draft"), null);
  }
});

test("removes an empty draft after all answers are confirmed", () => {
  const storage = makeStorage({ draft: JSON.stringify([["q1", "1"]]) });
  assert.equal(writePendingAnswerDraft({ storage, key: "draft", entries: [] }), true);
  assert.equal(storage.getItem("draft"), null);
});

test("reports unavailable storage without pretending the draft was saved", () => {
  const blockedStorage = {
    getItem() { throw new Error("storage blocked"); },
    setItem() { throw new Error("quota"); },
    removeItem() { throw new Error("storage blocked"); }
  };
  const restored = readPendingAnswerDraft({ storage: blockedStorage, key: "draft", questions });
  assert.equal(restored.unavailable, true);
  assert.equal(restored.answers.size, 0);
  assert.equal(writePendingAnswerDraft({ storage: blockedStorage, key: "draft", entries: [["q1", "0"]] }), false);
  assert.equal(writePendingAnswerDraft({ storage: null, key: "draft", entries: [] }), false);
});

test("rejects a draft larger than the 500-question CBT limit", () => {
  const storage = makeStorage({ draft: JSON.stringify([["q1", "1"]]) });
  const entries = Array.from({ length: 501 }, (_, index) => ["q" + index, "0"]);
  assert.equal(writePendingAnswerDraft({ storage, key: "draft", entries }), false);
  assert.equal(storage.getItem("draft"), JSON.stringify([["q1", "1"]]), "rejected writes must preserve the previous recoverable draft");

  storage.setItem("draft", JSON.stringify(entries));
  const restored = readPendingAnswerDraft({ storage, key: "draft", questions });
  assert.equal(restored.answers.size, 0);
  assert.equal(restored.discarded, 1);
  assert.equal(storage.getItem("draft"), null);
});

test("rejects oversized serialized drafts without replacing an existing draft", () => {
  const original = JSON.stringify([["q1", "1"]]);
  const storage = makeStorage({ draft: original });
  assert.equal(writePendingAnswerDraft({
    storage,
    key: "draft",
    entries: [["x".repeat(129 * 1024), "0"]]
  }), false);
  assert.equal(storage.getItem("draft"), original);
});

test("discards oversized stored data before attempting JSON restoration", () => {
  const storage = makeStorage({ draft: "x".repeat(129 * 1024) });
  const restored = readPendingAnswerDraft({ storage, key: "draft", questions });
  assert.equal(restored.answers.size, 0);
  assert.equal(restored.discarded, 1);
  assert.equal(storage.getItem("draft"), null);
});

test("accepts a full 500-answer draft within the configured bounds", () => {
  const fullQuestions = Array.from({ length: 500 }, (_, index) => ({ id: "q" + index, options: ["A", "B", "C", "D"] }));
  const entries = fullQuestions.map(question => [question.id, "2"]);
  const storage = makeStorage();
  assert.equal(writePendingAnswerDraft({ storage, key: "draft", entries }), true);
  const restored = readPendingAnswerDraft({ storage, key: "draft", questions: fullQuestions });
  assert.equal(restored.answers.size, 500);
  assert.equal(restored.discarded, 0);
});

test("accepts a serialized draft exactly at the 128 KiB UTF-8 byte limit", () => {
  const maxBytes = 128 * 1024;
  const emptyIdBytes = new TextEncoder().encode(JSON.stringify([["", "0"]])).byteLength;
  const questionId = "x".repeat(maxBytes - emptyIdBytes);
  const entries = [[questionId, "0"]];
  const serialized = JSON.stringify(entries);
  assert.equal(new TextEncoder().encode(serialized).byteLength, maxBytes);

  const storage = makeStorage();
  assert.equal(writePendingAnswerDraft({ storage, key: "draft", entries }), true);
  const restored = readPendingAnswerDraft({
    storage,
    key: "draft",
    questions: [{ id: questionId, options: ["A"] }]
  });
  assert.equal(restored.answers.get(questionId), "0");
  assert.equal(restored.discarded, 0);
});

test("enforces the 128 KiB limit using UTF-8 bytes, not JavaScript string length", () => {
  const multibyteId = "é".repeat(65_536);
  const oversizedRaw = JSON.stringify([[multibyteId, "0"]]);
  assert.ok(oversizedRaw.length < 128 * 1024);
  assert.ok(new TextEncoder().encode(oversizedRaw).byteLength > 128 * 1024);

  const readStorage = makeStorage({ draft: oversizedRaw });
  const restored = readPendingAnswerDraft({ storage: readStorage, key: "draft", questions });
  assert.equal(restored.answers.size, 0);
  assert.equal(restored.discarded, 1);
  assert.equal(readStorage.getItem("draft"), null);

  const previousDraft = JSON.stringify([["q1", "1"]]);
  const writeStorage = makeStorage({ draft: previousDraft });
  assert.equal(writePendingAnswerDraft({
    storage: writeStorage,
    key: "draft",
    entries: [[multibyteId, "0"]]
  }), false);
  assert.equal(writeStorage.getItem("draft"), previousDraft);
});



test("discards all answers for duplicate question IDs instead of applying last-write-wins", () => {
  const storage = makeStorage({
    draft: JSON.stringify([["q1", "0"], ["q2", "1"], ["q1", "2"], ["q1", "3"]])
  });
  const restored = readPendingAnswerDraft({ storage, key: "draft", questions });
  assert.deepEqual([...restored.answers], [["q2", "1"]]);
  assert.equal(restored.discarded, 3);
});

test("does not let a later duplicate rescue an earlier malformed answer", () => {
  const storage = makeStorage({
    draft: JSON.stringify([["q1", null], ["q1", "1"], ["q2", "0"]])
  });
  const restored = readPendingAnswerDraft({ storage, key: "draft", questions });
  assert.deepEqual([...restored.answers], [["q2", "0"]]);
  assert.equal(restored.discarded, 2);
});
