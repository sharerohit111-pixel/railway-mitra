import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createCbtExamLifecycle } from "../exam-lifecycle.mjs";

test("exam lifecycle remains active until destroyed and destruction is idempotent", () => {
  const lifecycle = createCbtExamLifecycle();
  assert.equal(lifecycle.isActive(), true);
  lifecycle.destroy();
  lifecycle.destroy();
  assert.equal(lifecycle.isActive(), false);
});

test("exam controller wires its lifecycle fence into teardown and shared status updates", () => {
  const source = readFileSync(new URL("../exam.js", import.meta.url), "utf8");
  assert.match(source, /import \{ createCbtExamLifecycle \} from "\.\/exam-lifecycle\.mjs"/);
  assert.match(source, /const lifecycle = createCbtExamLifecycle\(\)/);
  assert.match(source, /const status = message => \{ if \(isActive\(\)\)/);
  assert.match(source, /destroy\(\)\{lifecycle\.destroy\(\)/);
});

test("late exam start, section, answer-save and submit continuations check controller liveness", () => {
  const source = readFileSync(new URL("../exam.js", import.meta.url), "utf8");
  const requiredGuards = [
    /await getStudentActiveCbtAttempt\(app,testId\);\s*if \(!isActive\(\)\) return;/,
    /await enterCbtSection\(app, attemptId, question\.section\);[\s\S]{0,180}if\(!isActive\(\) \|\| finished \|\| request !== navigationRequest\) return;/,
    /if \(!isActive\(\)\) return;[\s\S]{0,500}return saveCbtAnswer\(app,attemptId,qid,value\);[\s\S]{0,500}if \(!isActive\(\)\) return;/,
    /await submitCbtExam\(app,attemptId\);\s*if \(!isActive\(\)\) return;/,
    /const onOnline=\(\)=>\{if \(!isActive\(\)\) return;/
  ];
  for (const guard of requiredGuards) assert.match(source, guard);
});


test("recovery submits only after the server explicitly reports a closed exam", () => {
  const source = readFileSync(new URL("../exam.js", import.meta.url), "utf8");
  assert.match(source, /error\?\.code !== "functions\/failed-precondition" \|\| error\?\.message !== "Exam is closed"\) throw error/);
});
