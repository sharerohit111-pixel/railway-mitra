const test = require("node:test");
const assert = require("node:assert/strict");
const { projectStudentQuestions } = require("../student-question-delivery");

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
