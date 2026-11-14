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
  assert.match(handler, /const result = await httpsCallable\(functions, "rmOwnerPublishTest"\)\(\{ testId: publishingTestId \}\);[\s\S]*?if \(generation !== testManagementGeneration\) return;/);
  assert.match(handler, /catch \(error\) \{\s*if \(generation !== testManagementGeneration\) return;/);
});


test("Question Bank save, delete and bulk-import continuations are fenced by Owner session generation", () => {
  assert.match(source, /let questionBankSessionGeneration = 0/);
  assert.match(source, /function clearQuestionBank\(\)\s*\{\s*questionBankSessionGeneration \+= 1/);

  const deleteStart = source.indexOf('remove.addEventListener("click"');
  const deleteEnd = source.indexOf('\n      });', deleteStart);
  const deleteHandler = source.slice(deleteStart, deleteEnd);
  assert.match(deleteHandler, /const sessionGeneration = questionBankSessionGeneration/);
  assert.match(deleteHandler, /await httpsCallable\(functions, "rmOwnerDeleteQuestionBankItem"\)[\s\S]*?if \(sessionGeneration !== questionBankSessionGeneration\) return;/);
  assert.match(deleteHandler, /catch \(error\) \{\s*if \(sessionGeneration !== questionBankSessionGeneration\) return;/);

  const saveStart = source.indexOf('questionBankForm.addEventListener("submit"');
  const saveEnd = source.indexOf('\n  });', saveStart);
  const saveHandler = source.slice(saveStart, saveEnd);
  assert.match(saveHandler, /const sessionGeneration = questionBankSessionGeneration/);
  assert.match(saveHandler, /await httpsCallable\(functions, "rmOwnerSaveQuestionBankItem"\)[\s\S]*?if \(sessionGeneration !== questionBankSessionGeneration\) return;/);
  assert.match(saveHandler, /catch \(error\) \{\s*if \(sessionGeneration !== questionBankSessionGeneration\) return;/);

  const bulkStart = source.indexOf('el("rm-qb-bulk-import").addEventListener("click"');
  const bulkEnd = source.indexOf('\n  });', bulkStart);
  const bulkHandler = source.slice(bulkStart, bulkEnd);
  assert.match(bulkHandler, /const sessionGeneration = questionBankSessionGeneration/);
  assert.match(bulkHandler, /if \(sessionGeneration !== questionBankSessionGeneration\) return;\s*const result = await httpsCallable\(functions, "rmOwnerBulkSaveQuestionBank"\)/);
  assert.match(bulkHandler, /await httpsCallable\(functions, "rmOwnerBulkSaveQuestionBank"\)[\s\S]*?if \(sessionGeneration !== questionBankSessionGeneration\) return;/);
  assert.match(bulkHandler, /catch \(error\) \{\s*if \(sessionGeneration !== questionBankSessionGeneration\) return;/);
});


test("Test Management save errors cannot update the dashboard after Owner session changes", () => {
  const start = source.indexOf('testForm.addEventListener("submit"');
  const end = source.indexOf('\n  });', start);
  assert.notEqual(start, -1);
  assert.notEqual(end, -1);
  const handler = source.slice(start, end);
  assert.match(handler, /const generation = testManagementGeneration/);
  assert.match(handler, /await httpsCallable\(functions, "rmOwnerSaveTest"\)[\s\S]*?if \(generation !== testManagementGeneration\) return;/);
  assert.match(handler, /catch \(e\) \{\s*if \(generation !== testManagementGeneration\) return;/);
});
