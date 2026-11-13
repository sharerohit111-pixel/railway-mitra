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
    studentUid: item.studentUid, attempts: item.attempts, testCount: item.tests.size,
    averageScore: Math.round(item.scoreTotal / item.attempts * 100) / 100,
    averageCorrectPercent: item.percentCount ? Math.round(item.correctPercentTotal / item.percentCount * 10) / 10 : null,
    lastSubmittedAt: item.lastSubmittedAt
  })).sort((a, b) => b.attempts - a.attempts || a.studentUid.localeCompare(b.studentUid));
}

function csvCell(value) {
  let text = value === null || value === undefined ? "" : String(value);
  if (/^\\s*[=+@-]/.test(text)) text = "'" + text;
  return '"' + text.replace(/"/g, '""') + '"';
}

export function studentActivityCsv(rows) {
  const columns = [["Student UID","studentUid"],["Test ID","testId"],["Test Name","testTitle"],["Score","score"],["Correct","correct"],["Wrong","wrong"],["Unattempted","unattempted"],["Total Questions","totalQuestions"],["Timed Out","timedOut"],["Submitted At","submittedAt"]];
  const lines = [columns.map(([label]) => csvCell(label)).join(",")];
  (Array.isArray(rows) ? rows : []).forEach(row => lines.push(columns.map(([,key]) => csvCell(key === "timedOut" ? (row?.[key] === true ? "Yes" : "No") : row?.[key])).join(",")));
  return lines.join("\\r\\n");
}

function htmlCell(value) {
  return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

export function studentActivityPrintHtml(rows, generatedAt = new Date()) {
  const columns = [["Student UID","studentUid"],["Test ID","testId"],["Test Name","testTitle"],["Score","score"],["Correct","correct"],["Wrong","wrong"],["Unattempted","unattempted"],["Total","totalQuestions"],["Timed Out","timedOut"],["Submitted At","submittedAt"]];
  const body = (Array.isArray(rows) ? rows : []).map(row => "<tr>" + columns.map(([, key]) => {
    let value = row?.[key];
    if (key === "timedOut") value = value === true ? "Yes" : "No";
    if (key === "submittedAt" && value) {
      const date = new Date(value);
      value = Number.isFinite(date.getTime()) ? date.toLocaleString() : "";
    }
    return "<td>" + htmlCell(value) + "</td>";
  }).join("") + "</tr>").join("");
  const stamp = generatedAt instanceof Date && Number.isFinite(generatedAt.getTime()) ? generatedAt.toLocaleString() : "";
  return `<!doctype html><html lang="hi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Railway Mitra — Student Results Report</title><style>
    body{font:12px Arial,sans-serif;color:#172033;margin:24px}h1{font-size:20px;margin:0 0 6px}p{color:#526078;margin:0 0 16px}
    table{border-collapse:collapse;width:100%;font-size:10px}th,td{border:1px solid #cbd5e1;padding:6px;text-align:left;overflow-wrap:anywhere}th{background:#eaf1fb}
    @page{size:landscape;margin:12mm}@media print{body{margin:0}}
  </style></head><body><h1>Railway Mitra — विद्यार्थी परीक्षा परिणाम</h1><p>कुल ${Array.isArray(rows) ? rows.length : 0} लोड किए गए परिणाम · रिपोर्ट समय: ${htmlCell(stamp)}</p><table><thead><tr>${columns.map(([label]) => "<th>" + htmlCell(label) + "</th>").join("")}</tr></thead><tbody>${body}</tbody></table><p>यह रिपोर्ट केवल वर्तमान में लोड किए गए और खोज के अनुसार फ़िल्टर किए गए परिणाम दिखाती है; यह सभी समय का संपूर्ण रिकॉर्ड नहीं है।</p></body></html>`;
}
