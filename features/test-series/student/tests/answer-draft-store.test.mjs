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
