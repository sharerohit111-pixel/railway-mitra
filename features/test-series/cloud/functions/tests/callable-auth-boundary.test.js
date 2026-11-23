"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const repositoryRoot = path.resolve(__dirname, "../../../../..");
const indexSource = fs.readFileSync(
  path.join(repositoryRoot, "features/test-series/cloud/functions/index.js"),
  "utf8"
);

const OWNER_CALLABLES = new Set([
  "rmOwnerCreateQuestionMediaUpload",
  "rmOwnerFinalizeQuestionMediaUpload",
  "rmGetOwnerAdminSession",
  "rmOwnerSetStudentTestAccess",
  "rmOwnerListStudentTestAccess",
  "rmOwnerListStudentAccessAudit",
  "rmOwnerSetFreeTest",
  "rmOwnerSaveTest",
  "rmOwnerPublishTest",
  "rmOwnerGetTest",
  "rmOwnerListTests",
  "rmOwnerSaveQuestionBankItem",
  "rmOwnerBulkSaveQuestionBank",
  "rmOwnerDeleteQuestionBankItem",
  "rmOwnerListQuestionBank",
  "rmOwnerListPayments",
  "rmOwnerListPaymentReconciliation",
  "rmOwnerInspectPaymentOrder",
  "rmOwnerListPaymentAudit",
  "rmOwnerListStudentActivity",
  "rmOwnerGetResultAnalytics"
]);
const STUDENT_CALLABLES = new Set([
  "rmClaimFreeAttempt",
  "rmStartExam",
  "rmGetExamQuestions",
  "rmGetQuestionMediaUrl",
  "rmEnterCbtSection",
  "rmSaveAnswer",
  "rmSubmitExam",
  "rmGetStudentActiveAttempt",
  "rmGetCbtAttemptResult",
  "rmListAvailableTests",
  "rmGetStudentTestAccess",
  "rmGetStudentDashboard",
  "rmGetTestLeaderboard",
  "rmCreatePaymentOrder"
]);

function discoverCallableHandlers(source) {
  const handlers = [];
  const pattern = /exports\.(\w+)\s*=\s*onCall\((?:CALLABLE_OPTIONS|\{\s*\.\.\.CALLABLE_OPTIONS[\s\S]*?\}),\s*async\s+req\s*=>\s*\{/g;
  for (const match of source.matchAll(pattern)) {
    const bodyStart = match.index + match[0].length;
    handlers.push({
      name: match[1],
      body: source.slice(bodyStart, bodyStart + 500)
    });
  }
  return handlers;
}

test("every CBT callable is explicitly classified as Student or Owner", () => {
  const handlers = discoverCallableHandlers(indexSource);
  const actualNames = handlers.map(handler => handler.name).sort();
  const expectedNames = [...OWNER_CALLABLES, ...STUDENT_CALLABLES].sort();

  assert.equal(handlers.length, (indexSource.match(/\bonCall\s*\(/g) || []).length,
    "every exported onCall declaration must be discovered");
  assert.deepEqual(actualNames, expectedNames,
    "new or renamed callables must be deliberately added to the authorization inventory");
  assert.equal([...OWNER_CALLABLES].some(name => STUDENT_CALLABLES.has(name)), false,
    "a callable cannot belong to both roles");
});

test("each callable applies its role guard before request data or Firestore access", () => {
  for (const handler of discoverCallableHandlers(indexSource)) {
    const expectedGuard = OWNER_CALLABLES.has(handler.name) ? "owner(req)" : "student(req)";
    const guardIndex = handler.body.indexOf(expectedGuard);
    const requestDataIndex = handler.body.indexOf("req.data");
    const firestoreIndex = handler.body.search(/\bdb\.(?:doc|collection|runTransaction)\b/);

    assert.ok(guardIndex >= 0, handler.name + " must invoke " + expectedGuard);
    if (requestDataIndex >= 0) {
      assert.ok(guardIndex < requestDataIndex,
        handler.name + " must authorize before reading caller-supplied request data");
    }
    if (firestoreIndex >= 0) {
      assert.ok(guardIndex < firestoreIndex,
        handler.name + " must authorize before Firestore access");
    }
  }
});

test("the Razorpay provider webhook remains a separately signed HTTP endpoint", () => {
  assert.match(indexSource, /exports\.rmRazorpayWebhook\s*=\s*onRequest/);
  assert.match(indexSource, /handleRazorpayWebhook\s*\(\s*\{/);
  assert.match(indexSource, /secrets:\s*\[RAZORPAY_WEBHOOK_SECRET\]/);
});
