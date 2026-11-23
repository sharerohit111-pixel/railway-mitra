"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { listJavaScriptFiles, checkSyntax } = require("../scripts/check-syntax");

test("syntax discovery includes nested JS module formats and excludes dependencies", t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "rm-cbt-syntax-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, "nested"), { recursive: true });
  fs.mkdirSync(path.join(root, "node_modules", "ignored"), { recursive: true });
  fs.writeFileSync(path.join(root, "index.js"), "module.exports = true;\n");
  fs.writeFileSync(path.join(root, "nested", "helper.mjs"), "export const value = 1;\n");
  fs.writeFileSync(path.join(root, "nested", "legacy.cjs"), "module.exports = 1;\n");
  fs.writeFileSync(path.join(root, "node_modules", "ignored", "dependency.js"), "not valid {{{\n");
  fs.writeFileSync(path.join(root, "notes.md"), "not JavaScript\n");

  assert.deepEqual(listJavaScriptFiles(root).map(file => path.relative(root, file)), [
    "index.js",
    "nested/helper.mjs",
    "nested/legacy.cjs"
  ]);
});

test("syntax validation visits every discovered source and fails closed", t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "rm-cbt-syntax-run-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, "nested"), { recursive: true });
  fs.writeFileSync(path.join(root, "one.js"), "module.exports = 1;\n");
  fs.writeFileSync(path.join(root, "nested", "two.mjs"), "export const two = 2;\n");

  const checked = [];
  assert.equal(checkSyntax(root, file => {
    checked.push(file);
    return true;
  }), 0);
  assert.equal(checked.length, 2);
  assert.equal(checkSyntax(root, file => !file.endsWith("one.js")), 1);
});
