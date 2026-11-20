"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

function listJavaScriptFiles(rootDirectory) {
  if (typeof rootDirectory !== "string" || !rootDirectory.trim()) {
    throw new TypeError("A source root directory is required");
  }

  const root = path.resolve(rootDirectory);
  const files = [];

  function visit(directory) {
    const entries = fs.readdirSync(directory, { withFileTypes: true })
      .sort((left, right) => left.name < right.name ? -1 : left.name > right.name ? 1 : 0);

    for (const entry of entries) {
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "node_modules" || entry.name === ".git") continue;
        visit(fullPath);
      } else if (entry.isFile() && /\.(?:c|m)?js$/i.test(entry.name)) {
        files.push(fullPath);
      }
    }
  }

  visit(root);
  return files;
}

function checkJavaScriptFile(filePath) {
  const result = spawnSync(process.execPath, ["--check", filePath], { stdio: "inherit" });
  if (result.error) {
    process.stderr.write("Unable to check " + filePath + ": " + result.error.message + "\n");
    return false;
  }
  return result.status === 0;
}

function checkSyntax(rootDirectory = __dirname, checkFile = checkJavaScriptFile) {
  const files = listJavaScriptFiles(rootDirectory);
  if (!files.length) {
    process.stderr.write("No JavaScript source files found for syntax validation.\n");
    return 1;
  }

  for (const file of files) {
    if (checkFile(file) !== true) return 1;
  }

  process.stdout.write("Syntax checked " + files.length + " JavaScript files.\n");
  return 0;
}

if (require.main === module) process.exitCode = checkSyntax();

module.exports = { listJavaScriptFiles, checkSyntax, checkJavaScriptFile };
