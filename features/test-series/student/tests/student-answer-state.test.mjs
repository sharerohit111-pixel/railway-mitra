import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createStudentAnswerState } from "../student-answer-state.mjs";

test("keeps prototype-sensitive question IDs as own mutable answer keys", () => {
  const saved = JSON.parse(
    '{"__proto__":"1","constructor":"0","toString":"2","hasOwnProperty":"3"}'
  );
  const answers = createStudentAnswerState(saved);

  assert.equal(Object.getPrototypeOf(answers), null);
  for (const [questionId, value] of Object.entries(saved)) {
    assert.equal(Object.hasOwn(answers, questionId), true);
    assert.equal(answers[questionId], value);
  }

  answers["__proto__"] = "0";
  assert.equal(Object.hasOwn(answers, "__proto__"), true);
  assert.equal(answers["__proto__"], "0");
  assert.equal(Object.prototype.polluted, undefined);
});

test("copies only own saved-answer fields and ignores inherited values", () => {
  const saved = Object.create({ inheritedQuestion: "1" });
  Object.defineProperty(saved, "ownQuestion", {
    value: "0",
    enumerable: true,
    writable: true,
    configurable: true
  });

  const answers = createStudentAnswerState(saved);
  assert.deepEqual(Object.keys(answers), ["ownQuestion"]);
  assert.equal(answers.ownQuestion, "0");
  assert.equal(Object.hasOwn(answers, "inheritedQuestion"), false);
});

test("rejects malformed maps and accessor-backed answer values without invoking getters", () => {
  for (const invalid of [null, [], "answers", 1]) {
    assert.throws(() => createStudentAnswerState(invalid), /must be an object/);
  }

  let getterCalled = false;
  const saved = {};
  Object.defineProperty(saved, "q1", {
    enumerable: true,
    get() {
      getterCalled = true;
      return "0";
    }
  });
  assert.throws(
    () => createStudentAnswerState(saved),
    /enumerable string data properties/
  );
  assert.equal(getterCalled, false);
});

test("exam controller uses the isolated prototype-safe answer state", () => {
  const source = readFileSync(new URL("../exam.js", import.meta.url), "utf8");
  assert.match(source, /import \{ createStudentAnswerState \} from "\.\/student-answer-state\.mjs"/);
  assert.match(source, /answers=createStudentAnswerState\(\)/);
  assert.match(source, /answers=createStudentAnswerState\(paper\.savedAnswers\)/);
  assert.match(source, /Object\.hasOwn\(answers,q\.id\)/);
  assert.match(source, /Object\.hasOwn\(answers,item\.id\)/);
});
