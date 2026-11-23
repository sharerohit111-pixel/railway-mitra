import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../exam.js", import.meta.url), "utf8");
const start = source.indexOf("async function renderQuestionMedia(");
const end = source.indexOf("\n  function render(", start);
const renderer = source.slice(start, end);

test("student renderer validates signed media responses before creating images", () => {
  assert.ok(start >= 0 && end > start);
  assert.match(source, /import \{ isSafeCbtQuestionMediaResponse \} from "\.\/question-media-view\.mjs"/);
  assert.match(renderer, /isSafeCbtQuestionMediaResponse\(response, descriptor\)/);
  assert.ok(renderer.indexOf("isSafeCbtQuestionMediaResponse") < renderer.indexOf("document.createElement(\"img\")"));
});

test("student renderer uses safe DOM text and accessible image metadata", () => {
  assert.match(renderer, /document\.createElement\("figure"\)/);
  assert.match(renderer, /document\.createElement\("img"\)/);
  assert.match(renderer, /image\.alt = response\.altText \|\| descriptor\.altText/);
  assert.match(renderer, /image\.referrerPolicy = "no-referrer"/);
  assert.doesNotMatch(renderer, /innerHTML|insertAdjacentHTML/);
});

test("late image responses cannot replace the currently selected question", () => {
  assert.match(renderer, /requestVersion !== mediaRenderVersion/);
  assert.match(renderer, /paper\.questions\[index\]\?\.id !== question\.id/);
  assert.match(renderer, /host\.replaceChildren\(\.\.\.figures\)/);
});
