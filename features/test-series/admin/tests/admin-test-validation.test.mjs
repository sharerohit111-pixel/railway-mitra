import { test } from "node:test";
import assert from "node:assert/strict";
import { validateOwnerTestDraft } from "../admin-test-validation.mjs";

function validDraft(overrides = {}) {
  return {
    title: "  Civil JE Mock Test  ",
    category: "GDCE JE",
    folder: "Civil / Mock Tests",
    mode: "mock",
    durationMinutes: "30",
    price: "0",
    marksPerQuestion: "1",
    negativeMarks: "0.25",
    status: "draft",
    questions: [{ id: " q1 ", text: "  Question one?  ", options: ["A", "B"], correctIndex: 0 }],
    ...overrides
  };
}

test("normalizes a valid mock test into the server payload contract", () => {
  const payload = validateOwnerTestDraft(validDraft());
  assert.equal(payload.title, "Civil JE Mock Test");
  assert.equal(payload.category, "GDCE JE");
  assert.equal(payload.folder, "Civil / Mock Tests");
  assert.equal(payload.durationMinutes, 30);
  assert.equal(payload.price, 0);
  assert.equal(payload.negativeMarks, 0.25);
  assert.deepEqual(payload.questions[0], {
    id: "q1", text: "Question one?", options: ["A", "B"], correctIndex: 0
  });
  assert.equal("scheduleStartAt" in payload, false);
});

test("accepts one and 500 questions but rejects zero and 501", () => {
  assert.equal(validateOwnerTestDraft(validDraft()).questions.length, 1);
  const questions = Array.from({ length: 500 }, (_, i) => ({
    id: "q" + (i + 1), text: "Question " + (i + 1), options: ["A", "B"], correctIndex: 0
  }));
  assert.equal(validateOwnerTestDraft(validDraft({ questions })).questions.length, 500);
  assert.throws(() => validateOwnerTestDraft(validDraft({ questions: [] })), /1 से 500/);
  questions.push({ id: "q501", text: "Question", options: ["A", "B"], correctIndex: 0 });
  assert.throws(() => validateOwnerTestDraft(validDraft({ questions })), /1 से 500/);
});

test("rejects sparse question, option and configured-section arrays", () => {
  const sparseQuestions = new Array(1);
  assert.throws(() => validateOwnerTestDraft(validDraft({ questions: sparseQuestions })), /1 से 500/);

  const sparseOptions = new Array(2);
  sparseOptions[1] = "B";
  assert.throws(() => validateOwnerTestDraft(validDraft({
    questions: [{ id: "q1", text: "Question?", options: sparseOptions, correctIndex: 0 }]
  })), /विकल्प/);

  const sparseSections = new Array(1);
  assert.throws(() => validateOwnerTestDraft(validDraft({ sections: sparseSections })), /सेक्शन सूची/);
});

test("rejects malformed questions, unsafe or duplicate IDs, and blank text", () => {
  assert.throws(() => validateOwnerTestDraft(validDraft({ questions: [null] })), /प्रारूप/);
  assert.throws(() => validateOwnerTestDraft(validDraft({ questions: [
    { id: "bad id", text: "Q", options: ["A", "B"], correctIndex: 0 }
  ] })), /ID/);
  assert.throws(() => validateOwnerTestDraft(validDraft({ questions: [
    { id: "q1", text: "Q1", options: ["A", "B"], correctIndex: 0 },
    { id: " q1 ", text: "Q2", options: ["A", "B"], correctIndex: 0 }
  ] })), /ID/);
  assert.throws(() => validateOwnerTestDraft(validDraft({ questions: [
    { id: "q1", text: "  ", options: ["A", "B"], correctIndex: 0 }
  ] })), /प्रश्न-पाठ/);
});

test("enforces question and option text limits and valid option counts", () => {
  assert.throws(() => validateOwnerTestDraft(validDraft({ questions: [
    { id: "q1", text: "x".repeat(5001), options: ["A", "B"], correctIndex: 0 }
  ] })), /5000/);
  assert.throws(() => validateOwnerTestDraft(validDraft({ questions: [
    { id: "q1", text: "Q", options: ["x".repeat(1001), "B"], correctIndex: 0 }
  ] })), /विकल्प/);
  for (const options of [[], ["A"], ["A", "B", "C", "D", "E", "F", "G"], ["A", " "]]) {
    assert.throws(() => validateOwnerTestDraft(validDraft({ questions: [
      { id: "q1", text: "Q", options, correctIndex: 0 }
    ] })), /विकल्प/);
  }
});

test("rejects non-text question section values instead of silently dropping them", () => {
  for (const section of [42, true, {}, []]) {
    assert.throws(() => validateOwnerTestDraft(validDraft({
      questions: [{ id: "q1", text: "Question?", options: ["A", "B"], correctIndex: 0, section }]
    })), /सेक्शन नाम text होना चाहिए/);
  }
});

test("rejects invalid correct-answer indexes", () => {
  for (const correctIndex of [-1, 2, 0.5, "0", NaN]) {
    assert.throws(() => validateOwnerTestDraft(validDraft({ questions: [
      { id: "q1", text: "Q", options: ["A", "B"], correctIndex }
    ] })), /correctIndex/);
  }
});

test("validates title, mode, duration, price and marking limits", () => {
  assert.throws(() => validateOwnerTestDraft(validDraft({ title: " " })), /टेस्ट का नाम/);
  assert.throws(() => validateOwnerTestDraft(validDraft({ title: "x".repeat(161) })), /160/);
  assert.throws(() => validateOwnerTestDraft(validDraft({ mode: "live" })), /Mock या Scheduled/);
  for (const durationMinutes of ["0", "241", "1.5", "abc"]) {
    assert.throws(() => validateOwnerTestDraft(validDraft({ durationMinutes })), /अवधि/);
  }
  for (const price of ["-1", "100001", "abc"]) {
    assert.throws(() => validateOwnerTestDraft(validDraft({ price })), /कीमत/);
  }
  for (const marksPerQuestion of ["0", "101", "abc"]) {
    assert.throws(() => validateOwnerTestDraft(validDraft({ marksPerQuestion })), /प्रत्येक प्रश्न/);
  }
  for (const negativeMarks of ["-1", "101", "abc"]) {
    assert.throws(() => validateOwnerTestDraft(validDraft({ negativeMarks })), /नकारात्मक अंक/);
  }
});

test("defaults blank category and folder and normalizes folder levels", () => {
  const payload = validateOwnerTestDraft(validDraft({ category: " ", folder: "  " }));
  assert.equal(payload.category, "General");
  assert.equal(payload.folder, "General");
  assert.equal(validateOwnerTestDraft(validDraft({ folder: " Civil / JE " })).folder, "Civil / JE");
});

test("rejects unsafe or oversized category and folder paths", () => {
  assert.equal(validateOwnerTestDraft(validDraft({ category: "सिविल JE", folder: "रेलवे / मॉक टेस्ट" })).folder, "रेलवे / मॉक टेस्ट");
  for (const category of ["x".repeat(61), "../admin", "Civil/JE"]) assert.throws(() => validateOwnerTestDraft(validDraft({ category })), /Category/);
  for (const folder of ["A//B", "../private", "A/B/C/D/E", "x".repeat(121), "A/" + "x".repeat(41)]) assert.throws(() => validateOwnerTestDraft(validDraft({ folder })), /Folder/);
});

test("validates scheduled windows and serializes local form times", () => {
  const payload = validateOwnerTestDraft(validDraft({
    mode: "scheduled",
    scheduleStartAt: "2026-11-13T10:00",
    scheduleEndAt: "2026-11-13T11:00"
  }));
  assert.equal(Date.parse(payload.scheduleEndAt) - Date.parse(payload.scheduleStartAt), 60 * 60 * 1000);
  assert.throws(() => validateOwnerTestDraft(validDraft({
    mode: "scheduled", scheduleStartAt: "", scheduleEndAt: "2026-11-13T11:00"
  })), /तिथि\/समय/);
  assert.throws(() => validateOwnerTestDraft(validDraft({
    mode: "scheduled", scheduleStartAt: "not-a-date", scheduleEndAt: "2026-11-13T11:00"
  })), /तिथि\/समय/);
  assert.throws(() => validateOwnerTestDraft(validDraft({
    mode: "scheduled", scheduleStartAt: "2026-11-13T11:00", scheduleEndAt: "2026-11-13T10:00"
  })), /समाप्ति का समय/);
});


test("preserves safe section labels on questions", () => {
  const payload = validateOwnerTestDraft(validDraft({
    questions: [
      { id: "q1", text: "First?", options: ["A", "B"], correctIndex: 0, section: "Technical Ability" },
      { id: "q2", text: "Second?", options: ["A", "B"], correctIndex: 1 }
    ]
  }));
  assert.equal(payload.questions[0].section, "Technical Ability");
  assert.equal("section" in payload.questions[1], false);
});

test("rejects overlong question section labels", () => {
  assert.throws(() => validateOwnerTestDraft(validDraft({
    questions: [{ id: "q1", text: "Question?", options: ["A", "B"], correctIndex: 0, section: "x".repeat(81) }]
  })), /सेक्शन नाम अधिकतम 80/);
});


test("derives section question counts and preserves configured section time limits", () => {
  const payload = validateOwnerTestDraft(validDraft({
    sections: [{ name: "Technical Ability", timeLimitMinutes: 25 }],
    questions: [
      { id: "q1", text: "Q1", options: ["A", "B"], correctIndex: 0, section: "Technical Ability" },
      { id: "q2", text: "Q2", options: ["A", "B"], correctIndex: 1, section: "technical ability" },
      { id: "q3", text: "Q3", options: ["A", "B"], correctIndex: 0 }
    ]
  }));
  assert.deepEqual(payload.sections, [{ name: "Technical Ability", timeLimitMinutes: 25, questionCount: 2 }]);
  assert.equal(payload.questions[1].section, "Technical Ability",
    "case-insensitive section labels must be normalized to the configured name");
});

test("rejects invalid or duplicate section time configuration", () => {
  for (const timeLimitMinutes of [-1, 241, 1.5, "abc"]) {
    assert.throws(() => validateOwnerTestDraft(validDraft({
      sections: [{ name: "Maths", timeLimitMinutes }],
      questions: [{ id: "q1", text: "Q", options: ["A", "B"], correctIndex: 0, section: "Maths" }]
    })), /सेक्शन/);
  }
  assert.throws(() => validateOwnerTestDraft(validDraft({
    sections: [{ name: "Maths", timeLimitMinutes: 10 }, { name: "maths", timeLimitMinutes: 15 }],
    questions: [{ id: "q1", text: "Q", options: ["A", "B"], correctIndex: 0, section: "Maths" }]
  })), /दोहराया/);
});


test("rejects control characters in question and configured section labels", () => {
  for (const codePoint of [10, 9, 0, 127]) {
    const section = "Math" + String.fromCharCode(codePoint) + "Ability";
    assert.throws(() => validateOwnerTestDraft(validDraft({
      questions: [{ id: "q1", text: "Q", options: ["A", "B"], correctIndex: 0, section }]
    })), /control characters/);

    assert.throws(() => validateOwnerTestDraft(validDraft({
      sections: [{ name: section, timeLimitMinutes: 5 }],
      questions: [{ id: "q1", text: "Q", options: ["A", "B"], correctIndex: 0, section: "Maths" }]
    })), /control characters/);
  }
});

test("rejects malformed section collections instead of silently discarding them", () => {
  for (const sections of [null, {}, "Technical Ability", 3]) {
    assert.throws(() => validateOwnerTestDraft(validDraft({ sections })), /सेक्शन सूची/);
  }
});

test("rejects configured sections with no mapped questions instead of dropping their time limits", () => {
  assert.throws(() => validateOwnerTestDraft(validDraft({
    sections: [
      { name: "Technical Ability", timeLimitMinutes: 25 },
      { name: "General Awareness", timeLimitMinutes: 10 }
    ],
    questions: [{ id: "q1", text: "Question?", options: ["A", "B"], correctIndex: 0, section: "Technical Ability" }]
  })), /हर बनाए गए सेक्शन में कम से कम एक प्रश्न/);
});

test("still derives an unconfigured section from question metadata when no explicit section is supplied", () => {
  const payload = validateOwnerTestDraft(validDraft({
    questions: [{ id: "q1", text: "Question?", options: ["A", "B"], correctIndex: 0, section: "Technical Ability" }]
  }));
  assert.deepEqual(payload.sections, [{ name: "Technical Ability", timeLimitMinutes: 0, questionCount: 1 }]);
});

test("preserves safe question media descriptors through the Owner Test Builder payload", () => {
  const payload = validateOwnerTestDraft(validDraft({
    questions: [{
      id: "q1",
      text: "Question one?",
      options: ["A", "B"],
      correctIndex: 0,
      media: [{
        id: "diagram_01",
        altText: "  Railway turnout layout  ",
        mimeType: "image/png",
        storagePath: "private/untrusted/path.png",
        downloadURL: "https://example.invalid/private?token=must-not-persist"
      }]
    }]
  }));
  assert.deepEqual(payload.questions[0].media, [{
    id: "diagram_01",
    altText: "Railway turnout layout",
    mimeType: "image/png"
  }]);
  assert.equal("storagePath" in payload.questions[0].media[0], false);
  assert.equal("downloadURL" in payload.questions[0].media[0], false);
});

test("rejects malformed Owner Test Builder media descriptors before draft save", () => {
  const valid = { id: "diagram_01", altText: "Turnout layout", mimeType: "image/png" };
  const invalidMedia = [
    [],
    new Array(1),
    [valid, { ...valid, id: "diagram_01" }],
    [{ ...valid, id: "../private" }],
    [{ ...valid, altText: " " }],
    [{ ...valid, altText: "Diagram\nlabel" }],
    [{ ...valid, altText: "Diagram\u0085label" }],
    [{ ...valid, altText: "x".repeat(201) }],
    [{ ...valid, mimeType: "image/svg+xml" }],
    [valid, valid, valid, { ...valid, id: "diagram_04" }],
    "https://example.invalid/image.png"
  ];
  for (const media of invalidMedia) {
    assert.throws(
      () => validateOwnerTestDraft(validDraft({
        questions: [{ id: "q1", text: "Question one?", options: ["A", "B"], correctIndex: 0, media }]
      })),
      /चित्र विवरण/,
      "invalid media descriptor input must be rejected"
    );
  }
});
