const test = require("node:test");
const assert = require("node:assert/strict");
const { projectStudentQuestionMedia } = require("../question-media-contract");

test("projects safe media descriptors and strips storage/private fields", () => {
  const result = projectStudentQuestionMedia([{
    id: "diagram_01",
    altText: "Railway turnout diagram",
    mimeType: "image/png",
    storagePath: "private/test/answer-key.png",
    downloadURL: "https://example.invalid/private?token=secret",
    correctIndex: 1
  }]);
  assert.deepEqual(result, [{
    id: "diagram_01",
    altText: "Railway turnout diagram",
    mimeType: "image/png"
  }]);
});

test("allows absent media for text-only questions", () => {
  assert.equal(projectStudentQuestionMedia(undefined), undefined);
  assert.equal(projectStudentQuestionMedia(null), undefined);
});

test("rejects malformed, sparse, oversized and duplicate media arrays", () => {
  const valid = { id: "diagram", altText: "Diagram", mimeType: "image/png" };
  assert.throws(() => projectStudentQuestionMedia([]), /invalid student question media/);
  assert.throws(() => projectStudentQuestionMedia(new Array(1)), /invalid student question media/);
  assert.throws(() => projectStudentQuestionMedia([valid, valid]), /invalid student question media/);
  assert.throws(() => projectStudentQuestionMedia([valid, valid, valid, valid]), /invalid student question media/);
  assert.throws(() => projectStudentQuestionMedia([{ ...valid, id: "../private" }]), /invalid student question media/);
  assert.throws(() => projectStudentQuestionMedia([{ ...valid, mimeType: "image/svg+xml" }]), /invalid student question media/);
  assert.throws(() => projectStudentQuestionMedia([{ ...valid, altText: " " }]), /invalid student question media/);
  assert.throws(() => projectStudentQuestionMedia([{ ...valid, altText: "x".repeat(201) }]), /invalid student question media/);
});

test("does not coerce object-valued descriptors or accept arbitrary media URLs", () => {
  assert.throws(() => projectStudentQuestionMedia(["https://example.invalid/image.png"]), /invalid student question media/);
  assert.throws(() => projectStudentQuestionMedia([{ id: "a", altText: "A", mimeType: "image/png", url: "https://example.invalid/a.png" }]), /invalid student question media/);
});

test("student question projection includes safe descriptors but never storage locations", () => {
  const { projectStudentQuestions } = require("../student-question-delivery");
  const [question] = projectStudentQuestions([{
    id: "q_diagram",
    text: "Identify the turnout component",
    options: ["A", "B"],
    media: [{
      id: "turnout_figure",
      altText: "Turnout layout",
      mimeType: "image/webp",
      storagePath: "private/tests/test_1/turnout.webp",
      downloadURL: "https://example.invalid/?token=secret"
    }],
    correctIndex: 1,
    explanation: "Private explanation"
  }]);
  assert.deepEqual(question.media, [{
    id: "turnout_figure",
    altText: "Turnout layout",
    mimeType: "image/webp"
  }]);
  assert.equal("storagePath" in question.media[0], false);
  assert.equal("downloadURL" in question.media[0], false);
  assert.equal("correctIndex" in question, false);
  assert.equal("explanation" in question, false);
});
