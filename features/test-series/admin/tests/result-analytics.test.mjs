import test from "node:test";
import assert from "node:assert/strict";
import { testAnalyticsCsv, testAnalyticsPrintHtml } from "../result-analytics.mjs";

const sample = {
  sampledAttempts: 3, window: "latest_500_submissions", hasMore: true,
  tests: [{ testId: "civil-01", title: "<img src=x onerror=alert(1)>", attempts: 3, averageScore: 42.5, averageCorrectPercent: 70, timedOut: 1, privateEmail: "secret@example.com" }]
};

test("test-wise CSV exports allow-listed fields and neutralizes formulas", () => {
  const csv = testAnalyticsCsv({ tests: [{ testId: "=HYPERLINK(test)", title: "Civil", attempts: 2, averageScore: 4 }] });
  assert.match(csv, /"'=HYPERLINK/);
  assert.doesNotMatch(csv, /privateEmail/);
  assert.match(csv, /Average Correct %/);
});

test("test-wise print report escapes untrusted titles and marks bounded analytics", () => {
  const html = testAnalyticsPrintHtml(sample, new Date("2026-11-13T10:00:00Z"));
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.doesNotMatch(html, /secret@example\.com|<img src=x/);
  assert.match(html, /नवीनतम 500/);
  assert.match(html, /जमा परिणाम: 3/);
});

test("empty analytics produces a safe empty report", () => {
  assert.match(testAnalyticsPrintHtml(null), /<tbody><\/tbody>/);
  assert.equal(testAnalyticsCsv(null).split("\r\n").length, 1);
});


import { filterAndSortTestAnalytics } from "../result-analytics.mjs";

test("filters test-wise analytics by ID or title and sorts requested metric", () => {
  const rows = [
    { testId: "civil-1", title: "Civil JE", attempts: 12, averageScore: 40, averageCorrectPercent: 60 },
    { testId: "math-1", title: "Math", attempts: 4, averageScore: 80, averageCorrectPercent: 90 },
    { testId: "civil-2", title: "Advanced Civil", attempts: 8, averageScore: 55, averageCorrectPercent: 75 }
  ];
  assert.deepEqual(filterAndSortTestAnalytics(rows, "civil", "averageScore").map(x => x.testId), ["civil-2", "civil-1"]);
  assert.deepEqual(filterAndSortTestAnalytics(rows, "MATH").map(x => x.testId), ["math-1"]);
  assert.deepEqual(filterAndSortTestAnalytics(rows, "", "averageCorrectPercent").map(x => x.testId), ["math-1", "civil-2", "civil-1"]);
});

test("malformed rows are ignored safely", () => {
  assert.deepEqual(filterAndSortTestAnalytics(null), []);
});
