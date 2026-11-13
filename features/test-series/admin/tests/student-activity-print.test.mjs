import test from "node:test";
import assert from "node:assert/strict";
import { studentActivityPrintHtml } from "../student-activity.mjs";

test("print report includes only allow-listed result fields and escapes HTML", () => {
  const html = studentActivityPrintHtml([{
    studentUid: "uid-1", testId: "test-1", testTitle: "<script>alert(1)</script>",
    score: 8, correct: 8, wrong: 1, unattempted: 1, totalQuestions: 10,
    timedOut: false, submittedAt: "2026-11-13T10:00:00.000Z",
    phone: "+911234567890", email: "private@example.com", answerSelections: ["A"]
  }], new Date("2026-11-13T10:30:00.000Z"));
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.doesNotMatch(html, /private@example\.com|\+911234567890|answerSelections/);
  assert.match(html, /Student UID/);
  assert.match(html, /कुल 1 लोड किए गए परिणाम/);
});

test("print report safely handles empty or malformed input", () => {
  const html = studentActivityPrintHtml(null, new Date("invalid"));
  assert.match(html, /कुल 0 लोड किए गए परिणाम/);
  assert.match(html, /<tbody><\/tbody>/);
});
