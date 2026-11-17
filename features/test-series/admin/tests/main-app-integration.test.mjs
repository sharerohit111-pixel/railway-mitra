"use strict";

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const app = readFileSync(new URL("../../../../app.html", import.meta.url), "utf8");
const landing = readFileSync(new URL("../../index.html", import.meta.url), "utf8");
const authGuard = readFileSync(new URL("../../../../assets/js/auth-guard.js", import.meta.url), "utf8");

test("signed-in main app exposes exactly one departmental Test Series entry", () => {
  const entries = app.match(/href="features\\/test-series\\/index\\.html"/g) || [];
  assert.equal(entries.length, 1, "Main app must expose exactly one Test Series entry");
});

test("main app keeps its body hidden until the existing auth guard is loaded", () => {
  assert.match(app, /html\\.auth-pending\\s+body\\s*\\{\\s*visibility:hidden\\s*\\}/);
  const pendingBootstrap = app.indexOf('document.documentElement.classList.add("auth-pending")');
  const guardScript = app.indexOf('<script type="module" src="assets/js/auth-guard.js');
  const bodyStart = app.indexOf("<body>");
  const guardScripts = app.match(/<script\\s+type="module"\\s+src="assets\\/js\\/auth-guard\\.js(?:\\?[^"]*)?"\\s*>/g) || [];

  assert.ok(pendingBootstrap >= 0, "Auth-pending bootstrap must exist before the page is shown");
  assert.ok(guardScript > pendingBootstrap, "Auth guard must load after the pending state is applied");
  assert.ok(bodyStart > guardScript, "Auth guard module must be in the document head");
  assert.equal(guardScripts.length, 1, "Main app must load the auth guard exactly once");
});

test("main-app auth guard preserves the explicitly requested temporary development mode", () => {
  assert.match(authGuard, /RAILWAY MITRA - TEMPORARY DEVELOPMENT MODE/);
  assert.match(authGuard, /Login guard disabled during app development/);
  assert.match(authGuard, /document\\.documentElement\\.classList\\.remove\\(["']auth-pending["']\\)/);
  assert.match(authGuard, /document\\.documentElement\\.dataset\\.authReady\\s*=\\s*["']true["']/);
  assert.doesNotMatch(authGuard, /onAuthStateChanged|signInWithPhoneNumber|loginUrl|window\\.location\\.replace/);
});

test("Test Series landing page exposes Student and Owner navigation without embedding credentials", () => {
  assert.equal((landing.match(/href="\\.\\/student\\/portal\\.html"/g) || []).length, 1);
  assert.equal((landing.match(/href="\\.\\/admin\\/portal\\.html"/g) || []).length, 1);
  assert.doesNotMatch(landing, /OWNER_UID|RAZORPAY_KEY_SECRET|serviceAccount/i);
});
