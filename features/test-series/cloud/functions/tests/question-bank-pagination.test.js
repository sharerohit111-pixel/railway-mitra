"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { selectQuestionBankPage } = require("../question-bank-pagination");

const rows = count => Array.from({ length: count }, (_, i) => ({ id: "q" + (i + 1) }));

test("continues after the last returned match when an extra match was scanned", () => {
  const result = selectQuestionBankPage({
    matches: rows(4), pageSize: 3, lastScannedId: "q100", scanLimited: false
  });
  assert.deepEqual(result.page.map(row => row.id), ["q1", "q2", "q3"]);
  assert.equal(result.nextCursor, "q3");
  assert.equal(result.hasMore, true);
});

test("continues after the last scanned record when a sparse filter reaches the scan cap", () => {
  const result = selectQuestionBankPage({
    matches: rows(2), pageSize: 3, lastScannedId: "q500", scanLimited: true
  });
  assert.deepEqual(result.page.map(row => row.id), ["q1", "q2"]);
  assert.equal(result.nextCursor, "q500");
  assert.equal(result.hasMore, true);
});

test("returns no cursor when the scan is exhausted and there are no extra matches", () => {
  const result = selectQuestionBankPage({
    matches: rows(3), pageSize: 3, lastScannedId: "q17", scanLimited: false
  });
  assert.equal(result.nextCursor, null);
  assert.equal(result.hasMore, false);
});

test("does not return an empty cursor when no records were scanned", () => {
  const result = selectQuestionBankPage({
    matches: [], pageSize: 3, lastScannedId: null, scanLimited: false
  });
  assert.deepEqual(result, { page: [], nextCursor: null, hasMore: false });
});
