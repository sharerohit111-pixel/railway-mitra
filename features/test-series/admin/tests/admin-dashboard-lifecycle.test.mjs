"use strict";

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../admin-dashboard.js", import.meta.url), "utf8");

test("Owner dashboard clears privileged data before a restored or changed account is verified", () => {
  const start = source.indexOf("onChecking: () => {");
  const end = source.indexOf("onSignedOut: () => {", start);
  assert.ok(start >= 0 && end > start, "Owner session watcher has an immediate checking callback");
  const handler = source.slice(start, end);
  for (const reset of ["clearPaymentHistory()", "clearTestManagement()", "clearStudentActivity()", "clearAnalytics()", "clearQuestionBank()"]) {
    assert.ok(handler.includes(reset), reset + " runs before authorization");
  }
  assert.match(handler, /home\.hidden = true/);
  assert.match(handler, /login\.hidden = false/);
});

test("Owner workspace is hidden before cleanup on every authentication transition", () => {
  const transitions = [
    ["onChecking: () => {", "onSignedOut: () => {"],
    ["onSignedOut: () => {", "onMfaRequired: () => {"],
    ["onMfaRequired: () => {", "onAuthorized: ("]
  ];
  for (const [startMarker, endMarker] of transitions) {
    const start = source.indexOf(startMarker);
    const end = source.indexOf(endMarker, start);
    assert.ok(start >= 0 && end > start, startMarker + " callback exists");
    const handler = source.slice(start, end);
    const hideIndex = handler.indexOf("home.hidden = true;");
    const firstCleanupIndex = handler.indexOf("clearPaymentHistory();");
    assert.ok(hideIndex >= 0 && firstCleanupIndex > hideIndex,
      startMarker + " hides privileged content before cleanup can throw");
  }
});

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
  assert.match(saveHandler, /finally \{\s*if \(sessionGeneration === questionBankSessionGeneration\) submit\.disabled = false;\s*\}/);

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

test("Question Bank bulk-import controls reset on Owner session change without stale unlocks", () => {
  const clearStart = source.indexOf("function clearQuestionBank() {");
  const clearEnd = source.indexOf("\n  }", clearStart);
  assert.ok(clearStart >= 0 && clearEnd > clearStart, "Question Bank cleanup must exist");
  const cleanup = source.slice(clearStart, clearEnd);
  assert.match(cleanup, /questionBankSessionGeneration \+= 1/);
  assert.match(cleanup, /el\("rm-qb-bulk-import"\)\.disabled = false/);

  const importStart = source.indexOf('el("rm-qb-bulk-import").addEventListener("click"');
  const importEnd = source.indexOf("\n  });", importStart);
  assert.ok(importStart >= 0 && importEnd > importStart, "Question Bank bulk import handler must exist");
  const handler = source.slice(importStart, importEnd);
  assert.match(handler, /const sessionGeneration = questionBankSessionGeneration/);
  assert.match(handler, /finally \{\s*if \(sessionGeneration === questionBankSessionGeneration\) button\.disabled = false;\s*\}/);
});


test("Owner free-test assignment preserves the server-derived permanent lock and ignores stale session completions", () => {
  const start = source.indexOf('el("rm-free-test-save").addEventListener("click"');
  const end = source.indexOf("\n  });", start);
  assert.ok(start >= 0 && end > start, "free-test assignment handler exists");
  const handler = source.slice(start, end);
  const generation = handler.indexOf("const generation = testManagementGeneration;");
  const request = handler.indexOf('await httpsCallable(functions, "rmOwnerSetFreeTest")');
  const successGuard = handler.indexOf("if (generation !== testManagementGeneration) return;", request);
  const successStatus = handler.indexOf('status("पहला निःशुल्क टेस्ट निर्धारित हुआ:', request);
  const refresh = handler.indexOf("await refreshTests();", successStatus);
  assert.ok(generation >= 0 && generation < request, "capture the current Owner generation before the request");
  assert.ok(successGuard > request && successGuard < successStatus, "ignore a late success after an Owner session change");
  assert.ok(successStatus < refresh, "refresh the server-owned lock state only for the current session");
  assert.match(handler, /catch \(e\) \{\s*if \(generation !== testManagementGeneration\) return;/);
  const finallyStart = handler.indexOf("finally {");
  const retryGuard = handler.indexOf("if (generation === testManagementGeneration && !freeTestSelect.disabled)", finallyStart);
  const enableButton = handler.indexOf("button.disabled = false;", finallyStart);
  assert.ok(finallyStart >= 0 && retryGuard > finallyStart && enableButton > retryGuard,
    "only an unlocked current session may re-enable the control");
  assert.doesNotMatch(handler, /finally \{\s*button\.disabled = false/);
});


test("Question Bank save control resets on Owner session change without stale unlocks", () => {
  const clearStart = source.indexOf("function clearQuestionBank() {");
  const clearEnd = source.indexOf("\n  }", clearStart);
  assert.ok(clearStart >= 0 && clearEnd > clearStart, "Question Bank cleanup must exist");
  const cleanup = source.slice(clearStart, clearEnd);
  assert.match(cleanup, /questionBankSessionGeneration \+= 1/);
  assert.match(cleanup, /el\("rm-qb-save"\)\.disabled = false/);

  const saveStart = source.indexOf('questionBankForm.addEventListener("submit"');
  const saveEnd = source.indexOf('\n  });', saveStart);
  assert.ok(saveStart >= 0 && saveEnd > saveStart, "Question Bank save handler must exist");
  const handler = source.slice(saveStart, saveEnd);
  assert.match(handler, /finally \{\s*if \(sessionGeneration === questionBankSessionGeneration\) submit\.disabled = false;\s*\}/);
});