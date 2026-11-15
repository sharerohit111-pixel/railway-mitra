const test = require("node:test");
const assert = require("node:assert/strict");
const {
  projectStudentQuestions,
  projectStudentSavedAnswers,
  isCanonicalStudentAnswerIndex,
  studentAnswerStorageKey,
  studentAnswerQuestionId
} = require("../student-question-delivery");

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


test("encoded answer-key namespace cannot collide with a valid raw question ID", () => {
  // This was the old prefix plus the base64url encoding of "__proto__".
  // It is itself a valid ID under QUESTION_ID_PATTERN.
  const rawQuestionId = "__rm_qid__X19wcm90b19f";
  const questionIds = [rawQuestionId, "__proto__"];
  const questions = questionIds.map(id => ({ id, text: "Question " + id, options: ["A", "B"] }));
  const rawKey = studentAnswerStorageKey(rawQuestionId);
  const prototypeKey = studentAnswerStorageKey("__proto__");

  assert.equal(rawKey, rawQuestionId);
  assert.equal(studentAnswerQuestionId(rawKey), rawQuestionId);
  assert.ok(prototypeKey.startsWith("q:"));
  assert.notEqual(prototypeKey, rawKey);

  const stored = Object.fromEntries([[rawKey, "0"], [prototypeKey, "1"]]);
  const projected = projectStudentSavedAnswers(questions, stored);
  assert.equal(projected[rawQuestionId], "0");
  assert.equal(Object.hasOwn(projected, "__proto__"), true);
  assert.equal(projected["__proto__"], "1");
});

test("answer saving accepts only canonical decimal indexes for the current option list", () => {
  const question = { id: "q1", options: ["A", "B", "C"] };
  assert.equal(isCanonicalStudentAnswerIndex(question, "0"), true);
  assert.equal(isCanonicalStudentAnswerIndex(question, "2"), true);

  for (const answer of [
    "00", "01", "-1", "+1", "1.0", "3",
    "999999999999999999999", 0, 1, null, false, [], {}
  ]) {
    assert.equal(
      isCanonicalStudentAnswerIndex(question, answer),
      false,
      "must reject non-canonical answer " + String(answer)
    );
  }

  assert.equal(isCanonicalStudentAnswerIndex({ id: "q2", options: ["A"] }, "0"), false);
  assert.equal(isCanonicalStudentAnswerIndex({ id: "q3", options: "A,B" }, "0"), false);
});
