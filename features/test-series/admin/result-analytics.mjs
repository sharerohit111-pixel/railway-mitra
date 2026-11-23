function csvCell(value) {
  let text = value === null || value === undefined ? "" : String(value);
  if (/^\s*[=+@-]/.test(text)) text = "'" + text;
  return '"' + text.replace(/"/g, '""') + '"';
}

const TEST_COLUMNS = [
  ["Test ID", "testId"], ["Test Name", "title"], ["Attempts", "attempts"],
  ["Average Score", "averageScore"], ["Average Correct %", "averageCorrectPercent"],
  ["Timed Out", "timedOut"]
];

export function testAnalyticsCsv(data) {
  const tests = Array.isArray(data?.tests) ? data.tests : [];
  return [
    TEST_COLUMNS.map(([label]) => csvCell(label)).join(","),
    ...tests.map(item => TEST_COLUMNS.map(([, key]) => csvCell(item?.[key] === null ? "" : item?.[key])).join(","))
  ].join("\r\n");
}

function htmlCell(value) {
  return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

export function testAnalyticsPrintHtml(data, generatedAt = new Date()) {
  const tests = Array.isArray(data?.tests) ? data.tests : [];
  const body = tests.map(item => "<tr>" + TEST_COLUMNS.map(([, key]) => "<td>" + htmlCell(item?.[key] === null ? "" : item?.[key]) + "</td>").join("") + "</tr>").join("");
  const stamp = generatedAt instanceof Date && Number.isFinite(generatedAt.getTime()) ? generatedAt.toLocaleString() : "";
  const sampled = Number.isFinite(Number(data?.sampledAttempts)) ? Number(data.sampledAttempts) : 0;
  const bounded = data?.window === "latest_500_submissions" || data?.hasMore === true;
  return `<!doctype html><html lang="hi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Railway Mitra — Test-wise Performance</title><style>
    body{font:12px Arial,sans-serif;color:#172033;margin:24px}h1{font-size:20px;margin:0 0 6px}p{color:#526078;margin:0 0 12px}
    table{border-collapse:collapse;width:100%;font-size:11px}th,td{border:1px solid #cbd5e1;padding:7px;text-align:left;overflow-wrap:anywhere}th{background:#eaf1fb}
    @page{size:landscape;margin:12mm}@media print{body{margin:0}}
  </style></head><body><h1>Railway Mitra — टेस्ट के अनुसार प्रदर्शन</h1><p>जमा परिणाम: ${sampled} · रिपोर्ट समय: ${htmlCell(stamp)}</p>${bounded ? "<p><strong>सीमा:</strong> यह रिपोर्ट नवीनतम 500 उपलब्ध जमा परिणामों के नमूने पर आधारित है; इसे lifetime total न मानें।</p>" : ""}<table><thead><tr>${TEST_COLUMNS.map(([label]) => "<th>" + htmlCell(label) + "</th>").join("")}</tr></thead><tbody>${body}</tbody></table></body></html>`;
}


export function filterAndSortTestAnalytics(rows, term = "", sortBy = "attempts") {
  const needle = String(term || "").trim().toLocaleLowerCase();
  const filtered = (Array.isArray(rows) ? rows : []).filter(item =>
    !needle || [item?.testId, item?.title].some(value => String(value || "").toLocaleLowerCase().includes(needle))
  );
  const numeric = value => Number.isFinite(Number(value)) ? Number(value) : -Infinity;
  return filtered.sort((a, b) => {
    if (sortBy === "title") return String(a?.title || a?.testId || "").localeCompare(String(b?.title || b?.testId || ""));
    if (sortBy === "averageScore") return numeric(b?.averageScore) - numeric(a?.averageScore);
    if (sortBy === "averageCorrectPercent") return numeric(b?.averageCorrectPercent) - numeric(a?.averageCorrectPercent);
    return numeric(b?.attempts) - numeric(a?.attempts) || String(a?.title || "").localeCompare(String(b?.title || ""));
  });
}
