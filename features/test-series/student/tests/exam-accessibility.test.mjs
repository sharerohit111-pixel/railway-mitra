import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("../exam.html", import.meta.url), "utf8");

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
