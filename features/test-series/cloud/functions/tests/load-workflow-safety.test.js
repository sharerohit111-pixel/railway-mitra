const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const repositoryRoot = path.resolve(__dirname, "../../../../..");
const workflowFiles = [
  ".github/workflows/test-series-firestore-load-emulator.yml",
  ".github/workflows/test-series-callable-load-emulator.yml"
];

function readRepositoryFile(relativePath) {
  return fs.readFileSync(path.join(repositoryRoot, relativePath), "utf8");
}

function declaredTriggers(workflow) {
  const lines = workflow.split(/\r?\n/);
  const onIndex = lines.findIndex((line) => /^on:\s*$/.test(line));
  assert.notEqual(onIndex, -1, "workflow must declare its event triggers");

  const triggers = [];
  for (let index = onIndex + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line.trim()) continue;
    if (!/^\s/.test(line)) break;
    const match = line.match(/^  ([A-Za-z0-9_-]+):\s*$/);
    if (match) triggers.push(match[1]);
  }
  return triggers;
}

for (const workflowPath of workflowFiles) {
  test(`${workflowPath} stays manual-only and requires explicit load-test approval`, () => {
    const workflow = readRepositoryFile(workflowPath);

    assert.deepEqual(declaredTriggers(workflow), ["workflow_dispatch"]);
    assert.match(workflow, /^\s{6}confirm_load_test:\s*$/m);
    assert.match(workflow, /^\s{8}required:\s*true\s*$/m);
    assert.match(workflow, /^\s{8}default:\s*false\s*$/m);
    assert.match(workflow, /^\s{8}type:\s*boolean\s*$/m);
    assert.match(
      workflow,
      /if:\s*\$\{\{\s*inputs\.confirm_load_test\s*==\s*true\s*\}\}/
    );
    assert.match(workflow, /emulators:exec/);
    assert.match(workflow, /GCLOUD_PROJECT:\s*demo-[A-Za-z0-9-]+/);
    assert.match(workflow, /--project\s+demo-[A-Za-z0-9-]+/);
    assert.doesNotMatch(workflow, /\bfirebase\s+deploy\b/i);
  });
}

test("load-test runbook records the current deferral and does not treat defaults as approval", () => {
  const runbook = readRepositoryFile("features/test-series/cloud/PERFORMANCE-LOAD-TEST.md");

  assert.match(runbook, /deferred until the project owner separately asks to resume/i);
  assert.match(runbook, /Do not dispatch either manual workflow/i);
  assert.match(runbook, /default input values are examples only, not authorization/i);
});

test("current hold explicitly blocks local and GitHub Actions harness execution", () => {
  const runbook = readRepositoryFile("features/test-series/cloud/PERFORMANCE-LOAD-TEST.md");

  assert.match(runbook, /Do not run either synthetic harness locally or through GitHub Actions while this hold is active/i);
  assert.match(runbook, /No local harness command is provided while the hold is active/i);
  const shellBlocks = [...runbook.matchAll(/```(?:bash|sh)[^\n]*\n([\s\S]*?)```/gi)]
    .map(match => match[1]);
  assert.equal(
    shellBlocks.some(block => /npm run load:|node\s+tests\/load\//.test(block)),
    false,
    "the deferred runbook must not expose an executable local load-test recipe"
  );
  assert.match(runbook, /No staged progression is authorized while this hold is active/i);
  assert.doesNotMatch(runbook, /Start with a small run|dispatch separate approved emulator runs/i);
});
