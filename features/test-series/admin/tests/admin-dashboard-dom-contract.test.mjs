"use strict";

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../admin-dashboard.js", import.meta.url), "utf8");
const markup = readFileSync(new URL("../admin-dashboard.html", import.meta.url), "utf8");

test("every statically referenced Owner dashboard element exists in its isolated markup", () => {
  const referencedIds = [...new Set([...source.matchAll(/\bel\(["']([^"']+)["']\)/g)].map(match => match[1]))];
  const markupIds = new Set([...markup.matchAll(/\bid=["']([^"']+)["']/g)].map(match => match[1]));
  const missing = referencedIds.filter(id => !markupIds.has(id));
  assert.deepEqual(missing, [], "Missing Owner dashboard element IDs: " + missing.join(", "));
});

test("Owner dashboard markup does not define duplicate element IDs", () => {
  const ids = [...markup.matchAll(/\bid=["']([^"']+)["']/g)].map(match => match[1]);
  const seen = new Set();
  const duplicates = new Set();
  for (const id of ids) {
    if (seen.has(id)) duplicates.add(id);
    seen.add(id);
  }
  assert.deepEqual([...duplicates], [], "Duplicate Owner dashboard element IDs: " + [...duplicates].join(", "));
});


test("both Owner import flows reject oversized files before reading or loading the spreadsheet parser", () => {
  for (const marker of [
    'el("rm-question-import").addEventListener',
    'el("rm-qb-bulk-import").addEventListener'
  ]) {
    const start = source.indexOf(marker);
    assert.notEqual(start, -1, "Missing import handler: " + marker);
    const end = source.indexOf("\\n  });", start);
    assert.notEqual(end, -1, "Could not locate import handler boundary: " + marker);
    const handler = source.slice(start, end);
    const guard = handler.indexOf("assertQuestionImportSize(file.size)");
    assert.notEqual(guard, -1, "Missing pre-read file-size guard: " + marker);
    for (const operation of ["file.text()", "file.arrayBuffer()", 'import("https://cdn.sheetjs.com']) {
      const index = handler.indexOf(operation);
      if (index >= 0) assert.ok(guard < index, operation + " must follow the size guard in " + marker);
    }
  }
});
