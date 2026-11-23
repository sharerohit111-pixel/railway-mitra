import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createCbtServerClock } from "../server-clock.mjs";

test("anchors exam time to the server timestamp and advances monotonically", () => {
  let monotonic = 100;
  const serverEpoch = Date.parse("2026-11-17T08:00:00.000Z");
  const clock = createCbtServerClock({
    serverNow: "2026-11-17T08:00:00.000Z",
    readMonotonicNow: () => monotonic
  });
  assert.equal(clock.now(), serverEpoch);
  monotonic += 1250;
  assert.equal(clock.now(), serverEpoch + 1250);
  monotonic += 750;
  assert.equal(clock.now(), serverEpoch + 2000);
});

test("device wall-clock changes cannot affect the monotonic exam clock", () => {
  let monotonic = 20;
  let deviceWallClock = Date.parse("2026-11-17T08:00:00.000Z");
  const serverEpoch = Date.parse("2026-11-17T08:00:00.000Z");
  const clock = createCbtServerClock({
    serverNow: "2026-11-17T08:00:00.000Z",
    readMonotonicNow: () => monotonic
  });
  deviceWallClock += 12 * 60 * 60 * 1000;
  assert.equal(clock.now(), serverEpoch);
  monotonic += 5000;
  deviceWallClock -= 24 * 60 * 60 * 1000;
  assert.equal(clock.now(), serverEpoch + 5000);
  assert.notEqual(deviceWallClock, clock.now());
});

test("monotonic clock regressions and read failures never move server time backwards", () => {
  let monotonic = 500;
  const serverEpoch = Date.parse("2026-11-17T08:00:00.000Z");
  const clock = createCbtServerClock({
    serverNow: "2026-11-17T08:00:00.000Z",
    readMonotonicNow: () => monotonic
  });
  monotonic += 3000;
  assert.equal(clock.now(), serverEpoch + 3000);
  monotonic = 200;
  assert.equal(clock.now(), serverEpoch + 3000);
  monotonic = NaN;
  assert.equal(clock.now(), serverEpoch + 3000);
});

test("invalid server anchors and unavailable monotonic clocks fail closed", () => {
  assert.throws(() => createCbtServerClock({ serverNow: "not-a-date", readMonotonicNow: () => 1 }), /server exam clock anchor/);
  assert.throws(() => createCbtServerClock({ serverNow: null, readMonotonicNow: () => 1 }), /server exam clock anchor/);
  assert.throws(() => createCbtServerClock({ serverNow: "2026-11-17T08:00:00.000Z", readMonotonicNow: () => NaN }), /monotonic exam clock/);
  assert.throws(() => createCbtServerClock({ serverNow: "2026-11-17T08:00:00.000Z", readMonotonicNow: 5 }), /monotonic clock reader/);
});

test("student exam controller uses the server anchor and not device wall time for deadlines", () => {
  const source = readFileSync(new URL("../exam.js", import.meta.url), "utf8");
  assert.match(source, /import \{ createCbtServerClock \} from "\.\/server-clock\.mjs"/);
  assert.match(source, /serverClock = createCbtServerClock\(\{ serverNow: paper\.serverNow \}\)/);
  assert.match(source, /expiresAt-examNow\(\)/);
  assert.match(source, /timing\.expiresAt\)\.getTime\(\) > examNow\(\)/);
  assert.doesNotMatch(source, /Date\.now\(\)/);
});
