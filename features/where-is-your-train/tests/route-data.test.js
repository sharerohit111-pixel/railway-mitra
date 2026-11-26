import test from "node:test";
import assert from "node:assert/strict";
import { CANDIDATE_ROUTE_FEATURE, decodePolyline } from "../route-data.js";
import { haversineMeters } from "../track-map-matcher.js";

test("bundled LGH-PLC geometry is the CC0 source-derived candidate", () => {
  const feature = CANDIDATE_ROUTE_FEATURE;
  assert.equal(feature.type, "Feature");
  assert.equal(feature.geometry.type, "LineString");
  assert.equal(feature.geometry.coordinates.length, 1140);
  assert.equal(feature.properties.route, "LGH-PLC");
  assert.equal(feature.properties.route_code, "671");
  assert.equal(feature.properties.candidate_status, "NOT_PRODUCTION_VERIFIED");
  assert.deepEqual(feature.properties.source_feature_ids, ["16025", "15810", "18037"]);
  assert.equal(feature.properties.chainage_to_km, 158.15);
  assert.equal(feature.properties.chainage_calibration.length, 3);
  assert.equal(feature.properties.source_geometry_sha256, "475fadf6525facf005f365c83cf03ca894dab75de0cf8cf697b8207748ea9678");
});

test("route polyline endpoints and geometry length are stable", () => {
  const coordinates = CANDIDATE_ROUTE_FEATURE.geometry.coordinates;
  assert.ok(Math.abs(coordinates[0][0] - 73.3140463) < 0.000001);
  assert.ok(Math.abs(coordinates[0][1] - 28.0437285) < 0.000001);
  assert.ok(Math.abs(coordinates.at(-1)[0] - 72.3691440) < 0.000001);
  assert.ok(Math.abs(coordinates.at(-1)[1] - 27.1245277) < 0.000001);
  const lengthKm = coordinates.slice(0, -1).reduce(
    (sum, point, index) => sum + haversineMeters(point, coordinates[index + 1]) / 1000,
    0
  );
  assert.ok(Math.abs(lengthKm - 158.085) < 0.2, `route length drift: ${lengthKm} km`);
});

test("chainage calibration is continuous and monotonic", () => {
  const rows = CANDIDATE_ROUTE_FEATURE.properties.chainage_calibration;
  assert.equal(rows[0].measure_from_m, 0);
  for (let i = 1; i < rows.length; i += 1) {
    assert.equal(rows[i].measure_from_m, rows[i - 1].measure_to_m);
    assert.equal(rows[i].chainage_from_km, rows[i - 1].chainage_to_km);
    assert.ok(rows[i].measure_to_m > rows[i].measure_from_m);
    assert.ok(rows[i].chainage_to_km > rows[i].chainage_from_km);
  }
  assert.equal(rows.at(-1).chainage_to_km, 158.15);
});

test("polyline decoder rejects truncated or empty geometry", () => {
  assert.throws(() => decodePolyline(""), /insufficient coordinates/);
  assert.throws(() => decodePolyline("abc"), /Truncated route polyline/);
});
