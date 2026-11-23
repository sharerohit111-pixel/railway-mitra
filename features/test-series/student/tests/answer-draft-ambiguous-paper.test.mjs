import test from "node:test";
import assert from "node:assert/strict";
import { readPendingAnswerDraft } from "../answer-draft-store.mjs";

function makeStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    values,
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); }
  };
}

test("does not restore answers against duplicate, empty or whitespace-only delivered question IDs", () => {
  const key = "draft";
  const storage = makeStorage({
    [key]: JSON.stringify([
      ["duplicate", "0"],
      ["", "0"],
      ["   ", "0"],
      ["good", "1"]
    ])
  });

  const restored = readPendingAnswerDraft({
    storage,
    key,
    questions: [
      { id: "duplicate", options: ["A", "B"] },
      // Even a malformed duplicate makes the ID ambiguous; a later valid
      // definition must not silently become the selected mapping.
      { id: "duplicate", options: null },
      { id: "", options: ["A"] },
      { id: "   ", options: ["A"] },
      { id: "good", options: ["A", "B"] }
    ]
  });

  assert.deepEqual([...restored.answers], [["good", "1"]]);
  assert.equal(restored.discarded, 3);
  assert.equal(restored.unavailable, false);
  assert.notEqual(storage.getItem(key), null, "a valid answer keeps the remaining recovery draft");
});
