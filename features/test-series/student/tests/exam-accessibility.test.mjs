import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("../exam.html", import.meta.url), "utf8");
const examJs = readFileSync(new URL("../exam.js", import.meta.url), "utf8");
import { restoreCbtOptionFocus } from "../exam-focus.mjs";

test("exam status remains visible after the start panel is hidden", () => {
  const statusIndex = html.indexOf('id="rm-cbt-status"');
  const startPanelIndex = html.indexOf('id="rm-cbt-start-panel"');
  assert.notEqual(statusIndex, -1);
  assert.ok(startPanelIndex > statusIndex, "status must be outside and before the hideable start panel");
  assert.match(html, /id="rm-cbt-status"[^>]*role="status"[^>]*aria-live="polite"/);
});

test("question changes and answer-save state are announced accessibly", () => {
  assert.match(html, /id="rm-cbt-count"[^>]*aria-live="polite"/);
  assert.match(html, /id="rm-cbt-question"[^>]*aria-live="polite"[^>]*aria-atomic="true"/);
  assert.match(html, /id="rm-cbt-saved"[^>]*role="status"[^>]*aria-live="polite"/);
  assert.match(html, /id="rm-cbt-options"[^>]*role="group"[^>]*aria-label="Answer options"/);
});

test("navigation landmarks have distinct accessible labels", () => {
  assert.match(html, /<nav class="rm-cbt-nav" aria-label="Question navigation">/);
  assert.match(html, /id="rm-cbt-palette"[^>]*aria-label="Question palette"/);
});


test("restores keyboard focus to the selected option after the option list is rebuilt", () => {
  const focused = [];
  const buttons = Array.from({ length: 4 }, (_, index) => ({
    disabled: false,
    focus() { focused.push(index); }
  }));
  const root = { querySelectorAll(selector) {
    assert.equal(selector, "button");
    return buttons;
  } };
  assert.equal(restoreCbtOptionFocus(root, 2), true);
  assert.deepEqual(focused, [2]);
});

test("does not focus disabled, missing, or invalid option targets", () => {
  const buttons = [
    { disabled: false, focus() { assert.fail("out-of-range target must not focus"); } },
    { disabled: true, focus() { assert.fail("disabled target must not focus"); } }
  ];
  const root = { querySelectorAll: () => buttons };
  assert.equal(restoreCbtOptionFocus(root, 1), false);
  assert.equal(restoreCbtOptionFocus(root, 5), false);
  assert.equal(restoreCbtOptionFocus(root, -1), false);
  assert.equal(restoreCbtOptionFocus(root, 1.5), false);
  assert.equal(restoreCbtOptionFocus(null, 0), false);
});

test("answer selection wires focus restoration into the CBT render path", () => {
  assert.match(examJs, /import \{ restoreCbtOptionFocus \} from "\.\/exam-focus\.mjs"/);
  assert.match(examJs, /function render\(\{\s*focusOptionIndex\s*=\s*null\s*\}\s*=\s*\{\}\)/);
  assert.match(examJs, /render\(\{\s*focusOptionIndex:\s*i\s*\}\)/);
  assert.match(examJs, /restoreCbtOptionFocus\(options,\s*focusOptionIndex\)/);
});
