"use strict";

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../admin-dashboard.js", import.meta.url), "utf8");

test("Owner publish review ignores late responses after the session generation changes", () => {
  assert.match(source, /async function openPublishReview\(test, button\)\s*\{\s*const generation = testManagementGeneration/);
  assert.match(source, /const response = await httpsCallable\(functions, "rmOwnerGetTest"\)\([\s\S]*?if \(generation !== testManagementGeneration\)/);
  assert.match(source, /catch \(error\) \{\s*if \(generation !== testManagementGeneration\) return;\s*reviewedTest = null;/);
});

test("Owner publish completion and errors cannot update a logged-out or changed-account dashboard", () => {
  const start = source.indexOf('reviewPublish.addEventListener("click"');
  const end = source.indexOf('\n  });', start);
  assert.notEqual(start, -1);
  assert.notEqual(end, -1);
  const handler = source.slice(start, end);
  assert.match(handler, /const generation = testManagementGeneration/);
  assert.match(handler, /const publishingTestId = reviewedTest\.testId/);
  assert.match(handler, /await httpsCallable\(functions, "rmOwnerPublishTest"\)\(\{ testId: publishingTestId \}\);\s*if \(generation !== testManagementGeneration\) return;/);
  assert.match(handler, /catch \(error\) \{\s*if \(generation !== testManagementGeneration\) return;/);
});
