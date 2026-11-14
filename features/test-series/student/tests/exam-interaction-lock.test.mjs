import test from "node:test";
import assert from "node:assert/strict";
import { lockCbtExamControls } from "../exam-interaction-lock.mjs";

const selectors = [
  "#rm-cbt-options button",
  "#rm-cbt-palette button",
  "#rm-cbt-section-progress button",
  "#rm-cbt-prev",
  "#rm-cbt-next",
  "#rm-cbt-retry",
  "#rm-cbt-submit"
];

function makeRoot() {
  const groups = new Map(selectors.map(selector => [selector, [{ disabled: false }]]));
  const unrelated = { disabled: false };
  return {
    groups,
    unrelated,
    querySelectorAll(selector) { return groups.get(selector) || []; }
  };
}

test("locks answer, palette, section, navigation, retry and submit controls", () => {
  const root = makeRoot();
  assert.equal(lockCbtExamControls(root), selectors.length);
  for (const selector of selectors) {
    assert.equal(root.groups.get(selector)[0].disabled, true, selector);
  }
  assert.equal(root.unrelated.disabled, false);
});

test("is idempotent and safely handles an unavailable root", () => {
  const root = makeRoot();
  assert.equal(lockCbtExamControls(root), selectors.length);
  assert.equal(lockCbtExamControls(root), selectors.length);
  assert.equal(lockCbtExamControls(null), 0);
  assert.equal(lockCbtExamControls({}), 0);
});
