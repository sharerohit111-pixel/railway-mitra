"use strict";

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const moduleSource = readFileSync(new URL("../owner-test-access-panel.mjs", import.meta.url), "utf8");
const dashboardSource = readFileSync(new URL("../admin-dashboard.js", import.meta.url), "utf8");
const markup = readFileSync(new URL("../admin-dashboard.html", import.meta.url), "utf8");

test("Owner access panel uses only the three server-protected callables", () => {
  for (const callable of [
    "rmOwnerSetStudentTestAccess",
    "rmOwnerListStudentTestAccess",
    "rmOwnerListStudentAccessAudit"
  ]) assert.ok(moduleSource.includes(callable), callable + " is wired");
  assert.doesNotMatch(moduleSource, /getFirestore|collection\(|getDocs\(/,
    "browser must not read protected access/audit collections directly");
});

test("Owner access panel prefers server-computed effective status for expired grants", () => {
  assert.match(moduleSource, /const effectiveStatus = item\.effectiveStatus \|\| item\.status/);
  assert.match(moduleSource, /if \(effectiveStatus === "active"\)/);
  const functionsSource = readFileSync(new URL("../../cloud/functions/index.js", import.meta.url), "utf8");
  assert.match(functionsSource, /effectiveStatus,[\s\S]*?expiryDate\.getTime\(\) <= responseNowMs/);
});

test("Owner access panel renders server data as text, not injected HTML", () => {
  assert.match(moduleSource, /node\.textContent = value/);
  assert.doesNotMatch(moduleSource, /innerHTML|insertAdjacentHTML/);
});

test("Owner access grant includes reason, unique request ID and optional ISO expiry", () => {
  assert.match(moduleSource, /reason,\s*requestId: crypto\.randomUUID\(\)/);
  assert.match(moduleSource, /payload\.expiresAt = expiry\.toISOString\(\)/);
  assert.match(moduleSource, /action: "grant"/);
});

test("Owner access mutations and list requests are fenced across session changes", () => {
  assert.match(moduleSource, /let sessionGeneration = 0/);
  assert.match(moduleSource, /currentSession !== sessionGeneration/);
  assert.match(moduleSource, /function renderAccess\(items\)[\s\S]*?const renderedSession = sessionGeneration/);
  assert.match(moduleSource, /if \(renderedSession !== sessionGeneration\) return;/);
  assert.match(moduleSource, /function reset\(\)[\s\S]*?sessionGeneration \+= 1/);
  assert.match(dashboardSource, /resetOwnerAccessPanel\(\)/);
  assert.match(dashboardSource, /if \(!ownerAccessPanel\) ownerAccessPanel = initOwnerTestAccessPanel\(functions\)/);
});

test("Owner dashboard exposes the access panel only inside the protected Owner workspace", () => {
  assert.match(markup, /<div id="rm-admin-home" hidden>/);
  assert.match(markup, /<button type="button" data-admin-module="access">/);
  assert.match(markup, /<section id="rm-admin-access-panel" class="rm-admin-panel" hidden>/);
  assert.match(markup, /id="rm-admin-access-audit-list"/);
});

test("Owner access and audit filters have matching Firestore composite indexes", () => {
  const indexes = JSON.parse(readFileSync(new URL("../../../../firestore.indexes.json", import.meta.url), "utf8")).indexes;
  const hasIndex = (collectionGroup, filterField, orderField) => indexes.some(index =>
    index.collectionGroup === collectionGroup &&
    index.queryScope === "COLLECTION" &&
    index.fields.some(field => field.fieldPath === filterField && field.order === "ASCENDING") &&
    index.fields.some(field => field.fieldPath === orderField && field.order === "DESCENDING")
  );
  for (const field of ["uid", "testId", "status"]) {
    assert.ok(hasIndex("testSeriesManualAccess", field, "updatedAt"), "manual access index: " + field);
  }
  for (const field of ["targetUid", "testId", "action"]) {
    assert.ok(hasIndex("testSeriesAccessAudit", field, "createdAt"), "access audit index: " + field);
  }
});

test("Owner access pagination and failed requests ignore stale responses", () => {
  assert.match(moduleSource, /if \(!reset && accessCursor\) payload\.cursor = accessCursor/);
  assert.match(moduleSource, /if \(!reset && auditCursor\) payload\.cursor = auditCursor/);
  assert.match(moduleSource, /catch \(error\) \{\s*if \(current !== accessGeneration \|\| currentSession !== sessionGeneration\) return;/);
  assert.match(moduleSource, /catch \(error\) \{\s*if \(current !== auditGeneration \|\| currentSession !== sessionGeneration\) return;/);
});
