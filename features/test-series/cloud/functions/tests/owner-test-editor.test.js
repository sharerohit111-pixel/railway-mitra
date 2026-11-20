const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const {
  normalizeOwnerTestTitle,
  normalizeOwnerQuestionExplanation,
  restoreOwnerQuestionAnswerKeys,
  validateOwnerQuestionPaper
} = require("../owner-test-editor");

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


test("rejects sparse question and option arrays at publish and answer-key restore boundaries", () => {
  const sparseQuestions = new Array(2);
  sparseQuestions[0] = questions[0];
  assert.throws(
    () => validateOwnerQuestionPaper(validTestMetadata, sparseQuestions, validAnswerMap),
    /Question count/
  );
  assert.throws(
    () => restoreOwnerQuestionAnswerKeys(sparseQuestions, validAnswerMap),
    /Public question set/
  );

  const sparseOptions = new Array(2);
  sparseOptions[1] = "B";
  const paper = [{ ...questions[0], options: sparseOptions }, questions[1]];
  assert.throws(
    () => validateOwnerQuestionPaper(validTestMetadata, paper, validAnswerMap),
    /options are invalid/
  );
  assert.throws(
    () => restoreOwnerQuestionAnswerKeys(paper, validAnswerMap),
    /answer key is missing or inconsistent/
  );
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

test("publish integrity independently enforces the fixed GDCE JE Civil pattern", () => {
  const gdceQuestions = Array.from({ length: 150 }, (_, index) => ({
    id: "gdce-" + index,
    text: "Question " + (index + 1),
    options: ["A", "B"],
  }));
  const gdceAnswers = Object.fromEntries(gdceQuestions.map(question => [
    question.id,
    { correctAnswer: "0" }
  ]));
  const metadata = {
    ...validTestMetadata,
    category: "GDCE JE Civil",
    durationMinutes: 120,
    marksPerQuestion: 1,
    negativeMarks: 1 / 3,
    questionCount: 150
  };

  assert.equal(validateOwnerQuestionPaper(metadata, gdceQuestions, gdceAnswers).length, 150);
  assert.throws(() => validateOwnerQuestionPaper(
    { ...metadata, questionCount: 149 },
    gdceQuestions,
    gdceAnswers
  ), /count/);
  assert.throws(() => validateOwnerQuestionPaper(
    { ...metadata, durationMinutes: 119 },
    gdceQuestions,
    gdceAnswers
  ), /GDCE JE Civil requires/);
  assert.throws(() => validateOwnerQuestionPaper(
    { ...metadata, negativeMarks: 0.25 },
    gdceQuestions,
    gdceAnswers
  ), /GDCE JE Civil requires/);
  assert.equal(validateOwnerQuestionPaper(validTestMetadata, questions, validAnswerMap).length, 2);
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

test("published tests remain immutable and student question delivery uses the validated allowlist projection", () => {
  const source = readFileSync(require.resolve("../index"), "utf8");
  const saveStart = source.indexOf("exports.rmOwnerSaveTest =");
  const publishStart = source.indexOf("exports.rmOwnerPublishTest =", saveStart);
  const saveHandler = source.slice(saveStart, publishStart);
  assert.match(saveHandler, /existing\.data\(\)\.status === "published"/);
  assert.match(saveHandler, /Published tests are immutable/);

  const deliveryStart = source.indexOf("exports.rmGetExamQuestions =");
  const deliveryEnd = source.indexOf("exports.rmEnterCbtSection =", deliveryStart);
  const deliveryHandler = source.slice(deliveryStart, deliveryEnd);
  assert.match(source, /projectStudentQuestions\(questions\)/);
  assert.match(deliveryHandler, /questions:\s*studentQuestions/);
  assert.doesNotMatch(deliveryHandler, /questions\.map\(/);
  assert.doesNotMatch(deliveryHandler, /correctIndex|correctAnswer|testSeriesAnswerKeys/);
});

test("Owner paper validation accepts safe image descriptors and rejects unsafe media metadata", () => {
  const paperWithMedia = [
    { ...questions[0], media: [{ id: "diagram1", altText: "Track turnout", mimeType: "image/png" }] },
    questions[1]
  ];
  assert.equal(validateOwnerQuestionPaper(validTestMetadata, paperWithMedia, validAnswerMap)[0].media[0].id, "diagram1");
  assert.throws(() => validateOwnerQuestionPaper(validTestMetadata, [
    { ...questions[0], media: [{ id: "../private", altText: "Diagram", mimeType: "image/png" }] },
    questions[1]
  ], validAnswerMap), /media descriptors are invalid/);
  assert.throws(() => validateOwnerQuestionPaper(validTestMetadata, [
    { ...questions[0], media: [{ id: "diagram1", altText: "Diagram", mimeType: "image/svg+xml" }] },
    questions[1]
  ], validAnswerMap), /media descriptors are invalid/);
  for (const code of [...Array(32).keys(), ...Array.from({ length: 33 }, (_, index) => index + 127)]) {
    const altText = "Diagram" + String.fromCharCode(code) + "label";
    assert.throws(() => validateOwnerQuestionPaper(validTestMetadata, [
      { ...questions[0], media: [{ id: "diagram1", altText, mimeType: "image/png" }] },
      questions[1]
    ], validAnswerMap), /media descriptors are invalid/, "alt-text control code " + code);
  }
});


test("publish integrity rejects C0, DEL and C1 controls in legacy question text, options and explanations", () => {
  const rejectedCodes = [0, 1, 8, 11, 12, 14, 31, 127, 0x80, 0x85, 0x9f];
  for (const code of rejectedCodes) {
    const control = String.fromCharCode(code);
    assert.throws(() => validateOwnerQuestionPaper(validTestMetadata, [
      { ...questions[0], text: "Question" + control + "1" }, questions[1]
    ], validAnswerMap), /text is invalid/, "question text control code " + code);
    assert.throws(() => validateOwnerQuestionPaper(validTestMetadata, [
      { ...questions[0], options: ["A" + control, "B"] }, questions[1]
    ], validAnswerMap), /options are invalid/, "option control code " + code);
    assert.throws(() => validateOwnerQuestionPaper(validTestMetadata, [
      { ...questions[0], explanation: "Reason" + control }, questions[1]
    ], validAnswerMap), /explanation is invalid/, "explanation control code " + code);
  }
});

test("publish integrity rejects all control characters in section labels", () => {
  for (const code of [0, 9, 10, 13, 127]) {
    const section = "Technical" + String.fromCharCode(code) + "Ability";
    assert.throws(() => validateOwnerQuestionPaper(validTestMetadata, [
      { ...questions[0], section }, questions[1]
    ], validAnswerMap), /section is invalid/, "section control code " + code);
  }
});

test("publish integrity preserves normal multiline formatting and bounds optional explanations", () => {
  const formatted = {
    ...questions[0],
    text: "Question line 1\nQuestion line 2",
    options: ["Option\tA", "Option B"],
    section: "Technical Ability",
    explanation: "Reason line 1\r\nReason line 2"
  };
  const result = validateOwnerQuestionPaper(validTestMetadata, [formatted, questions[1]], validAnswerMap);
  assert.equal(result[0].text, formatted.text);
  assert.equal(result[0].options[0], "Option\tA");
  assert.equal(result[0].explanation, formatted.explanation);

  const exactExplanation = "x".repeat(4000);
  assert.equal(validateOwnerQuestionPaper(validTestMetadata, [
    { ...questions[0], explanation: exactExplanation }, questions[1]
  ], validAnswerMap)[0].explanation.length, 4000);
  assert.throws(() => validateOwnerQuestionPaper(validTestMetadata, [
    { ...questions[0], explanation: exactExplanation + "x" }, questions[1]
  ], validAnswerMap), /explanation is invalid/);
  assert.throws(() => validateOwnerQuestionPaper(validTestMetadata, [
    { ...questions[0], explanation: { text: "not text" } }, questions[1]
  ], validAnswerMap), /explanation is invalid/);
});


test("publish integrity independently rejects unsafe category and folder metadata in legacy drafts", () => {
  for (const category of [
    "Civil/JE",
    "Civil<script>",
    "Civil" + String.fromCharCode(10) + "JE",
    "x".repeat(61)
  ]) {
    assert.throws(
      () => validateOwnerQuestionPaper({ ...validTestMetadata, category }, questions, validAnswerMap),
      /category or folder is invalid/,
      "unsafe category: " + JSON.stringify(category)
    );
  }

  for (const folder of [
    "../Admin",
    "Civil//Surveying",
    "Civil/Surveying/Practice/Extra/Fifth",
    "x".repeat(41),
    "Civil/Bad#Name",
    "x".repeat(121)
  ]) {
    assert.throws(
      () => validateOwnerQuestionPaper({ ...validTestMetadata, folder }, questions, validAnswerMap),
      /category or folder is invalid/,
      "unsafe folder: " + JSON.stringify(folder)
    );
  }

  const localized = {
    ...validTestMetadata,
    category: "रेलवे JE",
    folder: "सिविल / सर्वेक्षण"
  };
  assert.equal(validateOwnerQuestionPaper(localized, questions, validAnswerMap).length, 2);
});

test("Owner test titles are normalized only after raw C0, DEL and C1 controls are rejected", () => {
  assert.equal(normalizeOwnerTestTitle("  GDCE JE – Civil Mock (2026)  "), "GDCE JE – Civil Mock (2026)");
  assert.equal(normalizeOwnerTestTitle("Railway Mitra: Departmental Test"), "Railway Mitra: Departmental Test");
  assert.equal(normalizeOwnerTestTitle("x".repeat(160)).length, 160);

  const rejectedCodes = [
    ...Array.from({ length: 32 }, (_, index) => index),
    0x7f, 0x80, 0x85, 0x9f
  ];
  for (const code of rejectedCodes) {
    const control = String.fromCharCode(code);
    assert.throws(() => normalizeOwnerTestTitle("Title" + control), /Test title is invalid/,
      "trailing control code " + code + " must be rejected before trim");
    assert.throws(() => normalizeOwnerTestTitle(control + "Title"), /Test title is invalid/,
      "leading control code " + code + " must be rejected before trim");
  }

  assert.throws(() => normalizeOwnerTestTitle("   "), /Test title is invalid/);
  assert.throws(() => normalizeOwnerTestTitle("x".repeat(161)), /Test title is invalid/);
});

test("publish validation rejects legacy test titles containing control characters", () => {
  for (const code of [9, 10, 13, 0x7f, 0x85, 0x9f]) {
    const title = "Civil JE" + String.fromCharCode(code) + " Mock";
    assert.throws(
      () => validateOwnerQuestionPaper({ ...validTestMetadata, title }, questions, validAnswerMap),
      /Test title is invalid/,
      "legacy title control code " + code
    );
  }
});

test("Owner draft-save callable uses the same raw title validator as publish", () => {
  const source = readFileSync(require.resolve("../index"), "utf8");
  assert.match(source, /normalizeOwnerTestTitle/);
  const payloadStart = source.indexOf("function ownerTestPayload");
  const payloadEnd = source.indexOf("\nexports.rmOwnerSaveTest", payloadStart);
  const payload = source.slice(payloadStart, payloadEnd);
  assert.ok(payloadStart >= 0 && payloadEnd > payloadStart, "Owner draft payload builder exists");
  assert.match(payload, /normalizeOwnerTestTitle\(data\.title\)/);
  assert.match(payload, /Test title must be 1–160 characters and contain no control characters/);
  const publishStart = source.indexOf("exports.rmOwnerPublishTest");
  const publishEnd = source.indexOf("\nexports.rmOwner", publishStart + 1);
  const publish = source.slice(publishStart, publishEnd < 0 ? undefined : publishEnd);
  assert.match(publish, /validateOwnerQuestionPaper\(test, questions, answerMap\)/);
});


test("publish integrity rejects raw C0, DEL and C1 controls in category and folder before trimming", () => {
  const rejectedCodes = [
    ...Array.from({ length: 32 }, (_, index) => index),
    0x7f, 0x80, 0x85, 0x9f
  ];
  for (const code of rejectedCodes) {
    const control = String.fromCharCode(code);
    for (const category of [control + "Civil", "Civil" + control]) {
      assert.throws(
        () => validateOwnerQuestionPaper({ ...validTestMetadata, category }, questions, validAnswerMap),
        /category or folder is invalid/,
        "raw category control code " + code
      );
    }
    for (const folder of [
      control + "Civil / Mock",
      "Civil / Mock" + control,
      "Civil / " + control + "Mock"
    ]) {
      assert.throws(
        () => validateOwnerQuestionPaper({ ...validTestMetadata, folder }, questions, validAnswerMap),
        /category or folder is invalid/,
        "raw folder control code " + code
      );
    }
  }
});


test("normalizes optional Owner question explanations with the shared publish policy", () => {
  assert.equal(normalizeOwnerQuestionExplanation(undefined), "");
  assert.equal(normalizeOwnerQuestionExplanation(null), "");
  const formatted = "Reason line 1\\r\\nReason line 2\\twith detail";
  assert.equal(normalizeOwnerQuestionExplanation(formatted), formatted);
  assert.equal(normalizeOwnerQuestionExplanation("x".repeat(4000)).length, 4000);

  for (const invalid of [42, {}, [], "x".repeat(4001), "Reason\\u0000text", "Reason\\u009ftext"]) {
    assert.throws(() => normalizeOwnerQuestionExplanation(invalid), /explanation is invalid/);
  }
});

test("Owner draft-save callable validates and persists the optional explanation field", () => {
  const source = readFileSync(require.resolve("../index"), "utf8");
  assert.match(source, /normalizeOwnerQuestionExplanation\\(q\\.explanation\\)/);
  assert.match(source, /\\.\\.\\.\\(explanation \\? \\{ explanation \\} : \\{\\}\\)/);
});
