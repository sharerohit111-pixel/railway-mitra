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


test("exam controller treats only expected prior-result responses as recoverable", () => {
  const source = readFileSync(new URL("../exam.js", import.meta.url), "utf8");
  assert.match(source, /import \{ classifyCbtAttemptResultError \} from "\.\/attempt-recovery\.mjs"/);
  assert.match(source, /const recovery = classifyCbtAttemptResultError\(error\)/);
  assert.match(source, /const active = await getStudentActiveCbtAttempt\(app,testId\)/);
  assert.match(source, /active\.status === "completed"/);
  assert.match(source, /recovery !== "in_progress"/);
});


test("ambiguous submit failures keep the same attempt available for an explicit retry", () => {
  const source = readFileSync(new URL("../exam.js", import.meta.url), "utf8");
  const start = source.indexOf("async function finish(auto=false){");
  const end = source.indexOf('el("rm-cbt-start")', start);
  assert.ok(start >= 0 && end > start, "the exam finish controller must be present");
  const finish = source.slice(start, end);

  assert.match(finish, /await submitCbtExam\(app,attemptId\)/,
    "submission retries must target the existing server attempt");
  assert.match(finish, /finished=false;el\("rm-cbt-submit"\)\.disabled=false;el\("rm-cbt-retry"\)\.disabled=false/,
    "a failed or ambiguous response must re-enable both submit and answer-retry controls");
  assert.match(finish, /try\{localStorage\.removeItem\(draftKey\(\)\);\}catch\(_\)\{\}\s*showResult\(score,timeoutWarning\)/,
    "pending local answer drafts must be cleared only after the server confirms submission");
  assert.match(finish, /status\(e\.message\|\|"Submit असफल। इंटरनेट जाँचकर फिर प्रयास करें।"\)/,
    "the failure must remain visible instead of pretending the result was received");
  assert.doesNotMatch(finish, /attemptId\s*=\s*null|startCbtExam\(/,
    "a submit retry must not discard the attempt or silently create a replacement");
});
