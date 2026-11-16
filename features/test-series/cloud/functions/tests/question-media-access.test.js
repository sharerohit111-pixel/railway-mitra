"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");

test("question media and question paper callables use a transaction-snapshot active-attempt fence", () => {
  const source = readFileSync(require.resolve("../index"), "utf8");
  const helper = readFileSync(require.resolve("../active-attempt-session"), "utf8");

  const mediaStart = source.indexOf("exports.rmGetQuestionMediaUrl =");
  const mediaEnd = source.indexOf("exports.rmEnterCbtSection =", mediaStart);
  const mediaHandler = source.slice(mediaStart, mediaEnd);
  assert.ok(mediaStart >= 0 && mediaEnd > mediaStart, "media URL callable exists");
  assert.match(mediaHandler, /const uid = student\(req\)/);
  assert.match(mediaHandler, /attemptSnap\.data\(\)\.uid !== uid/);
  assert.match(mediaHandler, /db\.runTransaction\(async tx =>/);
  assert.match(mediaHandler, /tx\.get\(attemptRef\)/);
  assert.match(mediaHandler, /tx\.get\(activeSessionRef\)/);
  assert.match(mediaHandler, /tx\.get\(paperRef\)/);
  assert.match(mediaHandler, /tx\.get\(mappingRef\)/);
  assert.match(mediaHandler, /attempt\.status !== "in_progress"/);
  assert.match(mediaHandler, /const attemptExpiresAt = date\(attempt\.expiresAt\)/);
  assert.match(mediaHandler, /isActiveAttemptSession\(\{ uid, attemptId, attempt, activeSession, now \}\)/);
  assert.match(mediaHandler, /projectStudentQuestions\(\[question\]\)/);
  assert.match(mediaHandler, /createHash\("sha256"\)/);
  assert.match(mediaHandler, /testSeriesQuestionMedia\//);
  assert.match(mediaHandler, /mapping\.status !== "ready"/);
  assert.match(mediaHandler, /typeof mapping\.generation !== "string"/);
  assert.ok(mediaHandler.includes('!/^[1-9]\\d*$/.test(mapping.generation)'));
  assert.match(mediaHandler, /generation !== mapping\.generation/);
  assert.match(mediaHandler, /size !== mapping\.sizeBytes/);
  assert.match(mediaHandler, /custom\.sha256 !== mapping\.sha256/);
  assert.match(mediaHandler, /size > 5 \* 1024 \* 1024/);
  assert.match(mediaHandler, /getSignedUrl/);
  assert.match(mediaHandler, /expires: expiresAt/);
  assert.doesNotMatch(mediaHandler, /req\.data\.(objectPath|storagePath|url|bucket)/);

  const questionStart = source.indexOf("exports.rmGetExamQuestions =");
  const questionEnd = source.indexOf("// Issue a short-lived read URL", questionStart);
  const questionHandler = source.slice(questionStart, questionEnd);
  assert.ok(questionStart >= 0 && questionEnd > questionStart, "question delivery callable exists");
  assert.match(questionHandler, /db\.runTransaction\(async tx =>/);
  assert.match(questionHandler, /tx\.get\(attemptRef\)/);
  assert.match(questionHandler, /tx\.get\(activeSessionRef\)/);
  assert.match(questionHandler, /tx\.get\(testRef\)/);
  assert.match(questionHandler, /tx\.get\(questionsRef\)/);
  assert.match(questionHandler, /isActiveAttemptSession\(\{ uid, attemptId, attempt, activeSession, now \}\)/);

  assert.match(helper, /attempt\.uid === uid/);
  assert.match(helper, /activeSession\.uid === uid/);
  assert.match(helper, /activeSession\.attemptId === attemptId/);
  assert.match(helper, /activeSession\.testId === attempt\.testId/);
  assert.match(helper, /activeSession\.status === "in_progress"/);
  assert.match(helper, /activeExpiresAt\.getTime\(\) === attemptExpiresAt\.getTime\(\)/);
});
