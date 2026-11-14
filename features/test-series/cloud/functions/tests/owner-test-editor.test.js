const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { restoreOwnerQuestionAnswerKeys, validateOwnerQuestionPaper } = require("../owner-test-editor");

const questions = [
  { id: "q1", text: "Question 1", options: ["A", "B"] },
  { id: "q2", text: "Question 2", options: ["A", "B", "C"] }
];

test("restores answer indexes from the private answer-key map", () => {
  const result = restoreOwnerQuestionAnswerKeys(questions, {
    q1: { correctAnswer: "0" },
    q2: { correctAnswer: "2" }
  });
  assert.deepEqual(result.map(question => question.correctIndex), [0, 2]);
  assert.equal(Object.hasOwn(questions[0], "correctIndex"), false);
});

test("allows an empty question set without an answer-key document", () => {
  assert.deepEqual(restoreOwnerQuestionAnswerKeys([], null), []);
});

test("rejects a missing answer key for a non-empty test", () => {
  assert.throws(() => restoreOwnerQuestionAnswerKeys(questions, null), /answer key is unavailable/);
});

test("rejects missing, malformed, negative and out-of-range answer indexes", () => {
  for (const answerMap of [
    { q1: { correctAnswer: "0" } },
    { q1: { correctAnswer: "x" }, q2: { correctAnswer: "1" } },
    { q1: { correctAnswer: "00" }, q2: { correctAnswer: "1" } },
    { q1: { correctAnswer: "-1" }, q2: { correctAnswer: "1" } },
    { q1: { correctAnswer: "2" }, q2: { correctAnswer: "1" } },
    { q1: { correctAnswer: "0" }, q2: { correctAnswer: "3" } }
  ]) {
    assert.throws(() => restoreOwnerQuestionAnswerKeys(questions, answerMap), /answer key is missing or inconsistent/);
  }
});

test("rejects malformed question collections and records", () => {
  assert.throws(() => restoreOwnerQuestionAnswerKeys({}, {}), /question set is invalid/);
  assert.throws(() => restoreOwnerQuestionAnswerKeys([null], {}), /Question record is invalid/);
});


const validTestMetadata = {
  title: "Civil JE Mock", category: "GDCE JE", folder: "Civil / Mock", mode: "mock", durationMinutes: 30, price: 0,
  marksPerQuestion: 1, negativeMarks: 0.25, questionCount: 2
};
const validAnswerMap = {
  q1: { correctAnswer: "0" },
  q2: { correctAnswer: "2" }
};

test("validates the complete paper, metadata and exact private answer-key coverage", () => {
  const result = validateOwnerQuestionPaper(validTestMetadata, questions, validAnswerMap);
  assert.deepEqual(result.map(question => question.correctIndex), [0, 2]);
});

test("blocks publish for metadata, question count, duplicate IDs, malformed options or extra answer keys", () => {
  assert.throws(() => validateOwnerQuestionPaper({ ...validTestMetadata, questionCount: 1 }, questions, validAnswerMap), /count/);
  assert.throws(() => validateOwnerQuestionPaper({ ...validTestMetadata, durationMinutes: 0 }, questions, validAnswerMap), /duration/);
  assert.throws(() => validateOwnerQuestionPaper({ ...validTestMetadata, title: " " }, questions, validAnswerMap), /title/);
  assert.throws(() => validateOwnerQuestionPaper(validTestMetadata, [{ ...questions[0] }, { ...questions[1], id: "q1" }], validAnswerMap), /ID/);
  assert.throws(() => validateOwnerQuestionPaper(validTestMetadata, [{ ...questions[0], options: ["A"] }, questions[1]], validAnswerMap), /options/);
  assert.throws(() => validateOwnerQuestionPaper(validTestMetadata, questions, { ...validAnswerMap, extra: { correctAnswer: "0" } }), /exactly match/);
  assert.throws(() => validateOwnerQuestionPaper(validTestMetadata, questions, { q1: { correctAnswer: "0" } }), /exactly match/);
  assert.throws(() => validateOwnerQuestionPaper(validTestMetadata,
    [{ ...questions[0], correctIndex: 0 }, questions[1]], validAnswerMap), /must not contain private answer indexes/);
  assert.throws(() => validateOwnerQuestionPaper({ ...validTestMetadata, mode: "scheduled", scheduleStartAt: "bad", scheduleEndAt: "also bad" },
    questions, validAnswerMap), /Scheduled test window/);
});

test("Owner loader fails closed when the question paper or private answer key is missing", () => {
  const source = readFileSync(require.resolve("../index"), "utf8");
  const start = source.indexOf("exports.rmOwnerGetTest =");
  const end = source.indexOf("exports.rmOwnerListTests =", start);
  const handler = source.slice(start, end);
  assert.ok(start >= 0 && end > start, "Owner test loader exists");
  assert.match(handler, /if \(!questionsSnap\.exists \|\| !answerKeySnap\.exists\)/);
  assert.match(handler, /publicQuestions\.length < 1/);
  assert.match(handler, /publicQuestions\.length > 500/);
  assert.match(handler, /editing is blocked/);
});

test("published tests remain immutable and student question delivery excludes private answer indexes", () => {
  const source = readFileSync(require.resolve("../index"), "utf8");
  const saveStart = source.indexOf("exports.rmOwnerSaveTest =");
  const publishStart = source.indexOf("exports.rmOwnerPublishTest =", saveStart);
  const saveHandler = source.slice(saveStart, publishStart);
  assert.match(saveHandler, /existing\.data\(\)\.status === "published"/);
  assert.match(saveHandler, /Published tests are immutable/);

  const deliveryStart = source.indexOf("exports.rmGetExamQuestions =");
  const deliveryEnd = source.indexOf("exports.rmEnterCbtSection =", deliveryStart);
  const deliveryHandler = source.slice(deliveryStart, deliveryEnd);
  assert.match(deliveryHandler, /questions\.map\(q => \(\{ id: q\.id, text: q\.text, options: q\.options/);
  assert.doesNotMatch(deliveryHandler, /correctIndex|correctAnswer|testSeriesAnswerKeys/);
});
