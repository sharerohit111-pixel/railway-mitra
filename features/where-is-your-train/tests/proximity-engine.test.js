import test from "node:test";
import assert from "node:assert/strict";
import { evaluateFiveKmApproach } from "../proximity-engine.js";

const base = {
  armed: true, routeGeometryProductionVerified: true, reportFeedProductionApproved: true,
  routeId: "14704-lgh-phl", expectedRouteId: "14704-lgh-phl",
  previousTrainNumber: "14704", currentTrainNumber: "14704",
  previousDirection: "UP", currentDirection: "UP",
  previousIndependentReporterCount: 2, currentIndependentReporterCount: 2,
  previousTrainKm: 20, currentTrainKm: 16, trainDirectionSign: -1,
  previousReportAt: 100000, currentReportAt: 220000,
  userTrackKm: 12, gpsAccuracyM: 12, gpsFixAt: 225000, now: 230000
};

test("fails closed while candidate route geometry is not production verified", () => {
  assert.equal(
    evaluateFiveKmApproach({ ...base, routeGeometryProductionVerified: false }).reason,
    "route_geometry_not_production_verified"
  );
});

test("fails closed until the train report feed is production approved", () => {
  assert.equal(
    evaluateFiveKmApproach({ ...base, reportFeedProductionApproved: false }).reason,
    "report_feed_not_production_approved"
  );
});

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

test("returns report-derived average speed rather than a nominal train speed", () => {
  const result = evaluateFiveKmApproach(base);
  assert.equal(result.eligible, true);
  assert.equal(result.observedAverageSpeedKmh, 120);
});

test("rejects an impossible report-derived speed", () => {
  const result = evaluateFiveKmApproach({
    ...base,
    currentReportAt: 130000,
    gpsFixAt: 135000,
    now: 140000
  });
  assert.equal(result.reason, "observed_speed_implausible");
});

test("rejects report pairs more than fifteen minutes apart", () => {
  const result = evaluateFiveKmApproach({
    ...base,
    currentReportAt: 100000 + 901000,
    gpsFixAt: 100000 + 906000,
    now: 100000 + 910000
  });
  assert.equal(result.reason, "report_interval_invalid");
});

test("applies a stricter speed ceiling when supplied for goods trains", () => {
  assert.equal(
    evaluateFiveKmApproach({ ...base, maxSpeedKmh: 100 }).reason,
    "observed_speed_implausible"
  );
});

test("does not alert when train identity is missing", () => {
  const { previousTrainNumber, currentTrainNumber, ...withoutIdentity } = base;
  assert.equal(evaluateFiveKmApproach(withoutIdentity).reason, "train_identity_missing");
});

test("does not alert without two independent reporters for both observations", () => {
  assert.equal(
    evaluateFiveKmApproach({ ...base, currentIndependentReporterCount: 1 }).reason,
    "independent_reports_insufficient"
  );
});

test("does not alert when the reported direction changes", () => {
  assert.equal(
    evaluateFiveKmApproach({ ...base, currentDirection: "DOWN" }).reason,
    "train_direction_changed"
  );
});

test("does not alert when reports belong to different trains", () => {
  assert.equal(
    evaluateFiveKmApproach({ ...base, currentTrainNumber: "14705" }).reason,
    "train_identity_mismatch"
  );
});

test("does not alert when route identity differs", () => {
  assert.equal(evaluateFiveKmApproach({ ...base, routeId: "other" }).reason, "route_mismatch");
});

test("does not alert with poor GPS accuracy", () => {
  assert.equal(evaluateFiveKmApproach({ ...base, gpsAccuracyM: 100 }).reason, "gps_accuracy_insufficient");
});
