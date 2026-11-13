import test from "node:test";
import assert from "node:assert/strict";
import { summarizeStudentActivity } from "../student-activity.mjs";

test("groups attempts by student and calculates summary metrics", () => {
  const rows = [
    { studentUid: "uid-a", testId: "t1", score: 8, correct: 8, totalQuestions: 10, submittedAt: "2026-11-01T10:00:00Z" },
    { studentUid: "uid-a", testId: "t2", score: 12, correct: 6, totalQuestions: 10, submittedAt: "2026-11-02T10:00:00Z" },
    { studentUid: "uid-b", testId: "t1", score: 5, correct: 5, totalQuestions: 5, submittedAt: "2026-11-03T10:00:00Z" },
    { studentUid: null, testId: "t3", score: 99 }
  ];
  const result = summarizeStudentActivity(rows);
  assert.equal(result.length, 2);
  assert.deepEqual(result[0], { studentUid: "uid-a", attempts: 2, testCount: 2, averageScore: 10, averageCorrectPercent: 70, lastSubmittedAt: "2026-11-02T10:00:00.000Z" });
  assert.equal(result[1].studentUid, "uid-b");
});

test("filters by student UID, test ID or test title", () => {
  const rows = [
    { studentUid: "uid-a", testId: "civil-1", testTitle: "Civil JE", score: 1 },
    { studentUid: "uid-b", testId: "math-1", testTitle: "Math", score: 2 }
  ];
  assert.deepEqual(summarizeStudentActivity(rows, "civil").map(x => x.studentUid), ["uid-a"]);
  assert.deepEqual(summarizeStudentActivity(rows, "UID-B").map(x => x.studentUid), ["uid-b"]);
});

test("handles empty and malformed input", () => {
  assert.deepEqual(summarizeStudentActivity(null), []);
  assert.equal(summarizeStudentActivity([{ studentUid: "uid", score: "bad" }])[0].averageScore, 0);
});
