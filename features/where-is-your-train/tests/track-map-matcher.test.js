import test from "node:test";
import assert from "node:assert/strict";
import { haversineMeters, matchGpsToRoute } from "../track-map-matcher.js";

function fixtureRoute(coordinates) {
  const lengths = coordinates.slice(0, -1).map((point, index) =>
    haversineMeters(point, coordinates[index + 1])
  );
  let measure = 0;
  let chainage = 0;
  const calibration = lengths.map((length, index) => {
    const nextMeasure = measure + length;
    const nextChainage = chainage + length / 1000;
    const row = {
      source_feature_id: String(index + 1),
      measure_from_m: measure,
      measure_to_m: nextMeasure,
      chainage_from_km: chainage,
      chainage_to_km: nextChainage
    };
    measure = nextMeasure;
    chainage = nextChainage;
    return row;
  });
  return {
    type: "Feature",
    properties: { route: "LGH-PLC", chainage_calibration: calibration },
    geometry: { type: "LineString", coordinates }
  };
}

const route = fixtureRoute([[72, 27], [72.01, 27], [72.02, 27]]);
const common = {
  routeId: "LGH-PLC",
  expectedRouteId: "LGH-PLC",
  routeFeature: route,
  accuracyM: 8,
  gpsFixAt: 95000,
  now: 100000
};

test("matches a fresh accurate GPS fix to the source-calibrated route chainage", () => {
  const result = matchGpsToRoute({
    ...common,
    latitude: 27.0001,
    longitude: 72.005
  });
  assert.equal(result.matched, true);
  assert.equal(result.reason, "gps_matched_to_route");
  assert.ok(result.chainageKm > 0.5 && result.chainageKm < 0.7);
  assert.ok(result.crossTrackDistanceM < 20);
});

test("rejects a different route identity", () => {
  const result = matchGpsToRoute({
    ...common,
    routeId: "OTHER-ROUTE",
    latitude: 27,
    longitude: 72.005
  });
  assert.equal(result.reason, "route_mismatch");
});

test("rejects inaccurate GPS", () => {
  const result = matchGpsToRoute({
    ...common,
    accuracyM: 75,
    latitude: 27,
    longitude: 72.005
  });
  assert.equal(result.reason, "gps_accuracy_insufficient");
});

test("rejects stale and future GPS timestamps", () => {
  assert.equal(matchGpsToRoute({
    ...common, gpsFixAt: 69000, latitude: 27, longitude: 72.005
  }).reason, "gps_fix_stale");
  assert.equal(matchGpsToRoute({
    ...common, gpsFixAt: 101000, latitude: 27, longitude: 72.005
  }).reason, "gps_timestamp_invalid");
});

test("rejects a GPS fix too far from the route", () => {
  const result = matchGpsToRoute({
    ...common,
    latitude: 27.02,
    longitude: 72.005
  });
  assert.equal(result.reason, "gps_off_verified_route");
});

test("rejects incomplete or discontinuous chainage calibration", () => {
  const badRoute = structuredClone(route);
  badRoute.properties.chainage_calibration[1].measure_from_m += 5;
  const result = matchGpsToRoute({
    ...common,
    routeFeature: badRoute,
    latitude: 27,
    longitude: 72.005
  });
  assert.equal(result.reason, "chainage_calibration_measure_gap");
});

test("rejects ambiguous parallel route projections", () => {
  const loopRoute = fixtureRoute([
    [72, 27],
    [72.01, 27],
    [72.01, 27.001],
    [72, 27.001]
  ]);
  const result = matchGpsToRoute({
    ...common,
    routeFeature: loopRoute,
    latitude: 27.0005,
    longitude: 72.005
  });
  assert.equal(result.reason, "ambiguous_track_match");
});

test("rejects malformed route geometry", () => {
  const result = matchGpsToRoute({
    ...common,
    routeFeature: { type: "Feature", properties: {}, geometry: { type: "Point", coordinates: [72, 27] } },
    latitude: 27,
    longitude: 72.005
  });
  assert.equal(result.reason, "route_geometry_invalid");
});
