const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");

test("question media URL callable is bound to authenticated active attempts and server-owned objects", () => {
  const source = readFileSync(require.resolve("../index"), "utf8");
  const start = source.indexOf("exports.rmGetQuestionMediaUrl =");
  const end = source.indexOf("exports.rmEnterCbtSection =", start);
  const handler = source.slice(start, end);
  assert.ok(start >= 0 && end > start, "media URL callable exists");
  assert.match(handler, /const uid = student\(req\)/);
  assert.match(handler, /attemptSnap\.data\(\)\.uid !== uid/);
  assert.match(handler, /attempt\.status !== "in_progress"/);
  assert.match(handler, /date\(attempt\.expiresAt\) <= new Date\(\)/);
  assert.match(handler, /projectStudentQuestions\(\[question\]\)/);
  assert.match(handler, /testSeriesQuestionMedia\//);
  assert.match(handler, /mapping\.status !== "ready"/);
  assert.match(handler, /generation !== String\(mapping\.generation\)/);
  assert.match(handler, /size > 5 \* 1024 \* 1024/);
  assert.match(handler, /getSignedUrl/);
  assert.doesNotMatch(handler, /req\.data\.(objectPath|storagePath|url|bucket)/);
});
