const test = require("node:test");
const assert = require("node:assert/strict");
const { projectStudentQuestions, projectStudentSavedAnswers } = require("../student-question-delivery");

test("projects an allowlisted student question and omits private fields", () => {
  const sourceOptions = ["Option A", "Option B"];
  const projected = projectStudentQuestions([{
    id: "q_1", text: "Choose the correct option", options: sourceOptions, section: "Technical Ability",
    correctIndex: 1, correctAnswer: "1", explanation: "Private explanation", ownerNote: "Internal", tags: ["private"]
  }]);

  assert.deepEqual(projected, [{
    id: "q_1", text: "Choose the correct option", options: ["Option A", "Option B"], section: "Technical Ability"
  }]);
  assert.notEqual(projected[0].options, sourceOptions);
});

test("rejects object-valued options that could carry nested answer metadata", () => {
  assert.throws(() => projectStudentQuestions([{
    id: "q_1", text: "Choose", options: ["A", { label: "B", correctAnswer: "1" }]
  }]), /invalid student question data/);
});

test("rejects duplicate or malformed question IDs and invalid paper shapes", () => {
  assert.throws(() => projectStudentQuestions([
    { id: "q_1", text: "First", options: ["A", "B"] },
    { id: "q_1", text: "Duplicate", options: ["A", "B"] }
  ]), /invalid student question data/);
  assert.throws(() => projectStudentQuestions([{ id: "../q", text: "Bad ID", options: ["A", "B"] }]), /invalid student question data/);
  assert.throws(() => projectStudentQuestions([{ id: "q_2", text: "No options", options: ["A"] }]), /invalid student question data/);
  assert.throws(() => projectStudentQuestions([]), /invalid student question data/);
});

test("projects only canonical saved option indexes belonging to the current paper", () => {
  const questions = [
    { id: "q1", text: "First?", options: ["A", "B"] },
    { id: "q2", text: "Second?", options: ["A", "B", "C"] }
  ];
  assert.deepEqual(projectStudentSavedAnswers(questions, { q1: "1", q2: "2" }), {
    q1: "1",
    q2: "2"
  });
  assert.deepEqual(projectStudentSavedAnswers(questions, undefined), {});
  assert.deepEqual(projectStudentSavedAnswers(questions, null), {});
});

test("rejects unknown, malformed and out-of-range saved answer fields", () => {
  const questions = [{ id: "q1", text: "First?", options: ["A", "B"] }];
  for (const answers of [
    [],
    "not-an-answer-map",
    { q1: 1 },
    { q1: null },
    { q1: "01" },
    { q1: "-1" },
    { q1: "2" },
    { q1: "1", privateNote: "must-not-be-forwarded" }
  ]) {
    assert.throws(
      () => projectStudentSavedAnswers(questions, answers),
      /invalid saved student answers/
    );
  }
});

test("preserves prototype-sensitive question IDs as own answer data properties", () => {
  const questions = [{ id: "__proto__", text: "Prototype key?", options: ["A", "B"] }];
  const answers = JSON.parse('{"__proto__":"1"}');
  const projected = projectStudentSavedAnswers(questions, answers);
  assert.equal(Object.hasOwn(projected, "__proto__"), true);
  assert.equal(projected["__proto__"], "1");
  assert.equal(Object.getPrototypeOf(projected), Object.prototype);
});
