const test = require("node:test");
const assert = require("node:assert/strict");

let validateOwnerTestDraft;
test.before(async () => {
  ({ validateOwnerTestDraft } = await import("../../../admin/admin-test-validation.mjs"));
});

const question = (overrides = {}) => ({
  id: "q1",
  text: "2 + 2?",
  options: ["3", "4", "5", "6"],
  correctIndex: 1,
  ...overrides
});

const draft = (overrides = {}) => ({
  title: "Validation Test",
  mode: "mock",
  durationMinutes: 30,
  price: 0,
  marksPerQuestion: 1,
  negativeMarks: 0,
  status: "draft",
  questions: [question()],
  ...overrides
});

test("accepts a valid mock test and returns a normalized payload", () => {
  const result = validateOwnerTestDraft(draft());
  assert.equal(result.title, "Validation Test");
  assert.equal(result.questions[0].correctIndex, 1);
  assert.equal(result.status, "draft");
});

test("rejects a missing or blank correct answer instead of defaulting to option zero", () => {
  assert.throws(
    () => validateOwnerTestDraft(draft({ questions: [question({ correctIndex: NaN })] })),
    /correctIndex/
  );
  assert.throws(
    () => validateOwnerTestDraft(draft({ questions: [question({ correctIndex: undefined })] })),
    /correctIndex/
  );
});

test("rejects duplicate question identifiers", () => {
  assert.throws(
    () => validateOwnerTestDraft(draft({ questions: [question(), question()] })),
    /दोहराई गई/
  );
});

test("rejects scheduled tests with an end time before the start time", () => {
  assert.throws(
    () => validateOwnerTestDraft(draft({
      mode: "scheduled",
      scheduleStartAt: "2030-01-02T10:00",
      scheduleEndAt: "2030-01-02T09:00"
    })),
    /समाप्ति का समय/
  );
});


test("enforces the fixed GDCE JE Civil pattern without restricting other tests", () => {
  const questions = Array.from({ length: 150 }, (_, index) => question({
    id: "q" + (index + 1)
  }));
  const valid = validateOwnerTestDraft(draft({
    title: "GDCE JE Civil Mock Test",
    category: "GDCE JE Civil",
    durationMinutes: 120,
    marksPerQuestion: 1,
    negativeMarks: 1 / 3,
    questions
  }));
  assert.equal(valid.questions.length, 150);
  assert.equal(valid.durationMinutes, 120);
  assert.equal(valid.negativeMarks, 1 / 3);

  assert.throws(() => validateOwnerTestDraft(draft({
    category: "GDCE JE Civil",
    durationMinutes: 120,
    marksPerQuestion: 1,
    negativeMarks: 1 / 3,
    questions: questions.slice(0, 149)
  })), /150 प्रश्न/);

  assert.throws(() => validateOwnerTestDraft(draft({
    category: "GDCE JE Civil",
    durationMinutes: 119,
    marksPerQuestion: 1,
    negativeMarks: 1 / 3,
    questions
  })), /150 प्रश्न/);

  assert.throws(() => validateOwnerTestDraft(draft({
    category: "GDCE JE Civil",
    durationMinutes: 120,
    marksPerQuestion: 1,
    negativeMarks: 0.25,
    questions
  })), /150 प्रश्न/);

  assert.equal(validateOwnerTestDraft(draft()).durationMinutes, 30);
});

test("normalizes valid scheduled wall-clock inputs to ISO timestamps", () => {
  const result = validateOwnerTestDraft(draft({
    mode: "scheduled",
    scheduleStartAt: "2030-01-02T10:00",
    scheduleEndAt: "2030-01-02T11:00"
  }));
  assert.match(result.scheduleStartAt, /^2030-01-02T/);
  assert.match(result.scheduleEndAt, /^2030-01-02T/);
  assert.ok(Date.parse(result.scheduleEndAt) > Date.parse(result.scheduleStartAt));
});
