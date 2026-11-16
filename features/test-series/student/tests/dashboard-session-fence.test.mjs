import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const dashboard = readFileSync(new URL("../dashboard.js", import.meta.url), "utf8");
const portal = readFileSync(new URL("../portal.js", import.meta.url), "utf8");

test("dashboard receives an active-session callback from the portal", () => {
  assert.ok(dashboard.includes("isSessionActive = () => true"));
  assert.ok(portal.includes("isSessionActive: () => requestVersion === portalState.viewRequestVersion && isCurrentStudentSession(sessionVersion, sessionUid)"));
});

test("dashboard refuses refreshes after the owning view or student session becomes stale", () => {
  assert.ok(dashboard.includes("if (!sessionIsActive()) return Promise.resolve({ results: [], stale: true });"));
  assert.ok(dashboard.includes("if (!sessionIsActive()) return { results: [], stale: true };"));
});

test("late dashboard responses cannot render a previous student result", () => {
  const response = dashboard.indexOf("await getStudentCbtDashboard(app)");
  const render = dashboard.indexOf("const total =", response);
  assert.ok(response >= 0 && render > response);
  assert.ok(dashboard.slice(response, render).includes("if (!sessionIsActive()) return { results: [], stale: true };"));
});

test("stale errors and completion cannot overwrite the new session UI", () => {
  const catchStart = dashboard.indexOf("} catch (error) {");
  const finallyStart = dashboard.indexOf("} finally {", catchStart);
  const catchBody = dashboard.slice(catchStart, finallyStart);
  const finallyEnd = dashboard.indexOf("\n      }\n    });", finallyStart);
  const finallyBody = dashboard.slice(finallyStart, finallyEnd);
  assert.ok(catchBody.includes("if (sessionIsActive()) status.textContent"));
  assert.ok(finallyBody.includes("if (sessionIsActive())"));
  assert.ok(finallyBody.includes("refresh.disabled = false"));
});

test("leaderboard actions are fenced to the dashboard owning session", () => {
  const clickStart = dashboard.indexOf('leaderboard.addEventListener("click"');
  const clickEnd = dashboard.indexOf("\n            });", clickStart);
  assert.ok(clickStart >= 0 && clickEnd > clickStart);
  assert.ok(dashboard.slice(clickStart, clickEnd).includes("if (!sessionIsActive()) return;"));
});
