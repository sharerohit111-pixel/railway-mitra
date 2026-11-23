import test from "node:test";
import assert from "node:assert/strict";
import { writePendingAnswerDraft, readPendingAnswerDraft } from "../answer-draft-store.mjs";

function makeStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    values,
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); }
  };
}

test("rejects malformed, non-canonical and duplicate draft entries without replacing recovery data", () => {
  const original = JSON.stringify([["q1", "2"]]);
  const invalid = [
    [null],
    [["q1"]],
    [["q1", 1]],
    [["q1", null]],
    [["q1", "01"]],
    [["q1", "-1"]],
    [["q1", "1.0"]],
    [["q1", "9007199254740992"]],
    [["", "0"]],
    [["q1", "0"], ["q1", "1"]]
  ];

  for (const entries of invalid) {
    const storage = makeStorage({ draft: original });
    assert.equal(writePendingAnswerDraft({ storage, key: "draft", entries }), false);
    assert.equal(storage.getItem("draft"), original);
  }
});

test("rejects sparse entry arrays and empty storage keys without mutating the previous draft", () => {
  const original = JSON.stringify([["q1", "0"]]);
  const storage = makeStorage({ draft: original });
  const sparseEntries = new Array(1);
  assert.equal(writePendingAnswerDraft({ storage, key: "draft", entries: sparseEntries }), false);
  assert.equal(writePendingAnswerDraft({ storage, key: "   ", entries: [["q2", "1"]] }), false);
  assert.equal(storage.getItem("draft"), original);
});

test("writes distinct canonical option indexes that can be restored against the delivered paper", () => {
  const storage = makeStorage();
  const entries = [["q1", "0"], ["q2", "12"]];
  assert.equal(writePendingAnswerDraft({ storage, key: "draft", entries }), true);
  const restored = readPendingAnswerDraft({
    storage,
    key: "draft",
    questions: [
      { id: "q1", options: ["A", "B"] },
      { id: "q2", options: Array.from({ length: 13 }, (_, i) => String(i)) }
    ]
  });
  assert.deepEqual([...restored.answers], entries);
  assert.equal(restored.discarded, 0);
});

test("preserves existing draft when a serialized payload exceeds the byte limit", () => {
  const original = JSON.stringify([["q1", "1"]]);
  const storage = makeStorage({ draft: original });
  assert.equal(writePendingAnswerDraft({
    storage,
    key: "draft",
    entries: [["x".repeat(129 * 1024), "0"]]
  }), false);
  assert.equal(storage.getItem("draft"), original);
});
