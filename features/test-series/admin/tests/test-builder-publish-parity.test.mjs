import { test } from "node:test";
import assert from "node:assert/strict";
import { validateOwnerTestDraft } from "../admin-test-validation.mjs";

function validDraft(questionOverrides = {}) {
  return {
    title: "Civil JE Mock Test",
    category: "GDCE JE",
    folder: "Civil / Mock Tests",
    mode: "mock",
    durationMinutes: 30,
    price: 0,
    marksPerQuestion: 1,
    negativeMarks: 0.25,
    questions: [{
      id: "q1",
      text: "Question one?",
      options: ["Option A", "Option B"],
      correctIndex: 0,
      ...questionOverrides
    }]
  };
}

test("Owner Test Builder rejects non-printing controls in question text and options before save", () => {
  const rejectedCodes = [0, 1, 8, 11, 12, 14, 31, 127];
  for (const code of rejectedCodes) {
    const control = String.fromCharCode(code);
    assert.throws(
      () => validateOwnerTestDraft(validDraft({ text: "Question" + control + "one?" })),
      /प्रश्न-पाठ/,
      "question text control code " + code
    );
    assert.throws(
      () => validateOwnerTestDraft(validDraft({ options: ["Option" + control + "A", "Option B"] })),
      /विकल्प/,
      "option control code " + code
    );
  }
});

test("Owner Test Builder preserves ordinary TAB, LF and CR formatting accepted by publish validation", () => {
  const text = "Question line 1\nQuestion line 2";
  const option = "Option\tA";
  const payload = validateOwnerTestDraft(validDraft({ text, options: [option, "Option B"] }));
  assert.equal(payload.questions[0].text, text);
  assert.equal(payload.questions[0].options[0], option);
});
