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
  const rejectedCodes = [0, 1, 8, 11, 12, 14, 31, 127, 0x80, 0x85, 0x9f];
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
  const text = "Question line 1\r\nQuestion line 2";
  const option = "Option\tA";
  const payload = validateOwnerTestDraft(validDraft({ text, options: [option, "Option B"] }));
  assert.equal(payload.questions[0].text, text);
  assert.equal(payload.questions[0].options[0], option);
});


test("Owner Test Builder rejects raw title C0, DEL and C1 controls before trimming", () => {
  const rejectedCodes = [
    ...Array.from({ length: 32 }, (_, index) => index),
    0x7f, 0x80, 0x85, 0x9f
  ];
  for (const code of rejectedCodes) {
    const control = String.fromCharCode(code);
    assert.throws(
      () => validateOwnerTestDraft({ ...validDraft(), title: "Title" + control }),
      /control characters/,
      "trailing title control code " + code
    );
    assert.throws(
      () => validateOwnerTestDraft({ ...validDraft(), title: control + "Title" }),
      /control characters/,
      "leading title control code " + code
    );
  }
});

test("Owner Test Builder keeps section-label validation aligned with the server C1 policy", () => {
  for (const code of [0x80, 0x85, 0x9f]) {
    const control = String.fromCharCode(code);
    assert.throws(
      () => validateOwnerTestDraft(validDraft({ section: "Technical" + control })),
      /control characters/,
      "question section control code " + code
    );

    const draft = validDraft({ section: "Technical" });
    draft.sections = [{ name: "Technical" + control, timeLimitMinutes: 0 }];
    assert.throws(
      () => validateOwnerTestDraft(draft),
      /control characters/,
      "configured section control code " + code
    );
  }
});

test("Owner Test Builder still normalizes safe surrounding spaces in Unicode titles and section labels", () => {
  const draft = {
    ...validDraft({ section: " Technical " }),
    title: "  विभागीय CBT – Civil  ",
    sections: [{ name: " Technical ", timeLimitMinutes: 0 }]
  };
  const payload = validateOwnerTestDraft(draft);
  assert.equal(payload.title, "विभागीय CBT – Civil");
  assert.equal(payload.questions[0].section, "Technical");
  assert.equal(payload.sections[0].name, "Technical");
});


test("Owner Test Builder rejects raw C0, DEL and C1 controls in category and folder before trimming", () => {
  const rejectedCodes = [
    ...Array.from({ length: 32 }, (_, index) => index),
    0x7f, 0x80, 0x85, 0x9f
  ];
  for (const code of rejectedCodes) {
    const control = String.fromCharCode(code);
    for (const category of [control + "GDCE JE", "GDCE JE" + control]) {
      assert.throws(
        () => validateOwnerTestDraft({ ...validDraft(), category }),
        /Category में control characters/,
        "raw category control code " + code
      );
    }
    for (const folder of [
      control + "Civil / Mock Tests",
      "Civil / Mock Tests" + control,
      "Civil / " + control + "Mock Tests"
    ]) {
      assert.throws(
        () => validateOwnerTestDraft({ ...validDraft(), folder }),
        /Folder में control characters/,
        "raw folder control code " + code
      );
    }
  }
});

test("Owner Test Builder normalizes ordinary surrounding spaces in Unicode category and folder metadata", () => {
  const payload = validateOwnerTestDraft({
    ...validDraft(),
    category: "  विभागीय JE  ",
    folder: "  सिविल / सर्वेक्षण  "
  });
  assert.equal(payload.category, "विभागीय JE");
  assert.equal(payload.folder, "सिविल / सर्वेक्षण");
});


test("Test Builder preserves optional explanations and validates them before draft save", () => {
  const explanation = "Reason line 1" + String.fromCharCode(13, 10) +
    "Reason line 2" + String.fromCharCode(9) + "with detail";
  const payload = validateOwnerTestDraft(validDraft({ explanation }));
  assert.equal(payload.questions[0].explanation, explanation);

  const withoutExplanation = validateOwnerTestDraft(validDraft());
  assert.equal(Object.hasOwn(withoutExplanation.questions[0], "explanation"), false);

  const exactLimit = "x".repeat(4000);
  assert.equal(validateOwnerTestDraft(validDraft({ explanation: exactLimit })).questions[0].explanation, exactLimit);

  for (const invalid of [
    42,
    {},
    [],
    "x".repeat(4001),
    "Reason" + String.fromCharCode(0) + "text",
    "Reason" + String.fromCharCode(0x85) + "text"
  ]) {
    assert.throws(
      () => validateOwnerTestDraft(validDraft({ explanation: invalid })),
      /Explanation/
    );
  }
});
