export function summarizeStudentActivity(rows, term = "") {
  const needle = String(term || "").trim().toLocaleLowerCase();
  const grouped = new Map();
  (Array.isArray(rows) ? rows : []).forEach(row => {
    const uid = typeof row?.studentUid === "string" ? row.studentUid : "";
    if (!uid) return;
    if (needle && ![uid, row.testId, row.testTitle].some(value => String(value || "").toLocaleLowerCase().includes(needle))) return;
    const item = grouped.get(uid) || { studentUid: uid, attempts: 0, tests: new Set(), scoreTotal: 0, correctPercentTotal: 0, percentCount: 0, lastSubmittedAt: null };
    item.attempts += 1;
    if (row.testId) item.tests.add(row.testId);
    const score = Number(row.score);
    if (Number.isFinite(score)) item.scoreTotal += score;
    const total = Number(row.totalQuestions), correct = Number(row.correct);
    if (Number.isFinite(total) && total > 0 && Number.isFinite(correct)) {
      item.correctPercentTotal += correct / total * 100;
      item.percentCount += 1;
    }
    const submitted = row.submittedAt ? new Date(row.submittedAt) : null;
    if (submitted && Number.isFinite(submitted.getTime()) && (!item.lastSubmittedAt || submitted > new Date(item.lastSubmittedAt))) item.lastSubmittedAt = submitted.toISOString();
    grouped.set(uid, item);
  });
  return [...grouped.values()].map(item => ({
    studentUid: item.studentUid,
    attempts: item.attempts,
    testCount: item.tests.size,
    averageScore: Math.round(item.scoreTotal / item.attempts * 100) / 100,
    averageCorrectPercent: item.percentCount ? Math.round(item.correctPercentTotal / item.percentCount * 10) / 10 : null,
    lastSubmittedAt: item.lastSubmittedAt
  })).sort((a, b) => b.attempts - a.attempts || a.studentUid.localeCompare(b.studentUid));
}

function csvCell(value) {
  let text = value === null || value === undefined ? "" : String(value);
  if (/^\s*[=+@-]/.test(text)) text = "'" + text;
  return '"' + text.replace(/"/g, '""') + '"';
}

export function studentActivityCsv(rows) {
  const columns = [["Student UID","studentUid"],["Test ID","testId"],["Test Name","testTitle"],["Score","score"],["Correct","correct"],["Wrong","wrong"],["Unattempted","unattempted"],["Total Questions","totalQuestions"],["Timed Out","timedOut"],["Submitted At","submittedAt"]];
  const lines = [columns.map(([label]) => csvCell(label)).join(",")];
  (Array.isArray(rows) ? rows : []).forEach(row => lines.push(columns.map(([,key]) => csvCell(key === "timedOut" ? (row?.[key] === true ? "Yes" : "No") : row?.[key])).join(",")));
  return lines.join("\r\n");
}
