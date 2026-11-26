import test from "node:test";
import assert from "node:assert/strict";
import { evaluateFiveKmApproach } from "../proximity-engine.js";

const base = {
  armed: true, routeId: "14704-lgh-phl", expectedRouteId: "14704-lgh-phl",
  previousTrainKm: 20, currentTrainKm: 16, trainDirectionSign: -1,
  previousReportAt: 100000, currentReportAt: 110000,
  userTrackKm: 12, gpsAccuracyM: 12, gpsFixAt: 115000, now: 120000
};

test("allows only a confirmed approach crossing into five kilometres", () => {
  const result = evaluateFiveKmApproach(base);
  assert.equal(result.eligible, true);
  assert.equal(result.distanceKm, 4);
});

test("does not alert when train is moving away", () => {
  assert.equal(evaluateFiveKmApproach({ ...base, currentTrainKm: 24 }).eligible, false);
});

test("does not alert without a fresh GPS fix", () => {
  assert.equal(evaluateFiveKmApproach({ ...base, gpsFixAt: 1 }).reason, "gps_fix_stale");
});

test("does not alert for stale train reports", () => {
  assert.equal(evaluateFiveKmApproach({ ...base, currentReportAt: 1 }).reason, "train_report_stale");
});

test("does not alert if already inside radius at first observation", () => {
  assert.equal(evaluateFiveKmApproach({ ...base, previousTrainKm: 16, currentTrainKm: 14 }).reason, "five_km_threshold_not_crossed");
});

test("does not alert when route identity differs", () => {
  assert.equal(evaluateFiveKmApproach({ ...base, routeId: "other" }).reason, "route_mismatch");
});

test("does not alert with poor GPS accuracy", () => {
  assert.equal(evaluateFiveKmApproach({ ...base, gpsAccuracyM: 100 }).reason, "gps_accuracy_insufficient");
});
