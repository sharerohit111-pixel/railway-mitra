const test = require("node:test");
const assert = require("node:assert/strict");

let validateOwnerTestDraft;
test.before(async () => {
  ({ validateOwnerTestDraft } = await import("../../admin/admin-test-validation.mjs"));
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
