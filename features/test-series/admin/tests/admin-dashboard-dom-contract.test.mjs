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
