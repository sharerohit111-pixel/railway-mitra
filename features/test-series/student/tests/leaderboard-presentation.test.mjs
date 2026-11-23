import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { getLeaderboardPresentation } from "../leaderboard-presentation.mjs";

test("labels the aggregate as submitted attempts with correct singular and plural forms", () => {
  assert.equal(
    getLeaderboardPresentation({ participantCount: 0, leaderboardComplete: true }).submissionCountText,
    "0 submitted attempts"
  );
  assert.equal(
    getLeaderboardPresentation({ participantCount: 1, leaderboardComplete: true }).submissionCountText,
    "1 submitted attempt"
  );
  assert.equal(
    getLeaderboardPresentation({ participantCount: 1250, leaderboardComplete: true }).submissionCountText,
    "1250 submitted attempts"
  );
});

test("does not turn an invalid aggregate count into a misleading zero", () => {
  for (const participantCount of [-1, 1.5, NaN, Infinity, "12", null]) {
    assert.equal(
      getLeaderboardPresentation({ participantCount, leaderboardComplete: true }).submissionCountText,
      "Submitted attempt count unavailable"
    );
  }
});

test("complete leaderboard copy explains attempt-based count and personal-best rank", () => {
  const result = getLeaderboardPresentation({ participantCount: 3, leaderboardComplete: true });
  assert.match(result.note, /submitted attempts, not unique students/);
  assert.match(result.note, /multiple attempts may appear more than once/);
  assert.match(result.note, /personal rank uses your best submitted attempt/);
  assert.match(result.note, /Equal scores share competition rank/);
  assert.equal(result.rankUnavailableText, "You have no submitted attempt for this test yet.");
});

test("partial or unspecified completeness never claims a complete personal rank", () => {
  for (const leaderboardComplete of [false, undefined, null]) {
    const result = getLeaderboardPresentation({ participantCount: 1000, leaderboardComplete });
    assert.match(result.note, /partial result sample/);
    assert.match(result.rankUnavailableText, /rank is unavailable/);
  }
});

test("leaderboard screen uses the shared presentation contract and removes stale sample wording", () => {
  const source = readFileSync(new URL("../leaderboard.js", import.meta.url), "utf8");
  assert.match(source, /getLeaderboardPresentation\(data\)/);
  assert.match(source, /presentation\.submissionCountText/);
  assert.match(source, /presentation\.rankUnavailableText/);
  assert.match(source, /presentation\.note/);
  assert.doesNotMatch(source, /first 1,000 result records/);
  assert.doesNotMatch(source, /submitted participant\(s\)/);
});
