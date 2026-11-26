import fs from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";
import { matchGpsToRoute } from "../track-map-matcher.js";
import { CANDIDATE_ROUTE_FEATURE } from "../route-data.js";

const routeDocument = JSON.parse(fs.readFileSync("gis-inspection/candidate-route.geojson", "utf8"));
const artifactRouteFeature = routeDocument.features?.[0];
assert.ok(artifactRouteFeature, "source-derived LGH-PLC route candidate must exist");
const routeFeature = CANDIDATE_ROUTE_FEATURE;
assert.equal(routeFeature.geometry.coordinates.length, artifactRouteFeature.geometry.coordinates.length);
assert.deepEqual(
  routeFeature.properties.chainage_calibration,
  artifactRouteFeature.properties.chainage_calibration
);
for (let i = 0; i < routeFeature.geometry.coordinates.length; i += 1) {
  for (let axis = 0; axis < 2; axis += 1) {
    assert.ok(
      Math.abs(routeFeature.geometry.coordinates[i][axis] - artifactRouteFeature.geometry.coordinates[i][axis]) <= 0.0000006,
      `bundled route coordinate drift at vertex ${i}, axis ${axis}`
    );
  }
}

const stationRows = fs.readFileSync(
  "gis-inspection/ir_stations_corridor_candidates.geojsonl",
  "utf8"
).split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line));

const expectedStations = new Set([
  "LALGARH", "GAJNER", "KOLAYAT", "DIYATRA ROAD",
  "NOKHRA", "BAAP", "MALAR", "PHALODI"
]);

for (const name of expectedStations) {
  test(`matches the actual source route at ${name} station anchor`, () => {
    const station = stationRows.find(row =>
      String(row.properties?.sttnname || "").trim().toUpperCase() === name
      && row.geometry?.type === "Point"
    );
    assert.ok(station, `station anchor missing: ${name}`);
    const [longitude, latitude] = station.geometry.coordinates;
    const props = station.properties || {};
    const stationChainage = Number(props.distkm) + Number(props.distm || 0) / 1000;
    const now = Date.now();
    const result = matchGpsToRoute({
      latitude,
      longitude,
      accuracyM: 5,
      gpsFixAt: now,
      now,
      routeId: "LGH-PLC",
      expectedRouteId: "LGH-PLC",
      routeFeature,
      // Phalodi station point is a station-centre anchor ~278m from the line.
      maxTrackOffsetM: name === "PHALODI" ? 500 : 100
    });
    assert.equal(result.matched, true, `${name}: ${JSON.stringify(result)}`);
    assert.ok(
      Math.abs(result.chainageKm - stationChainage) <= 0.5,
      `${name} chainage mismatch: projected=${result.chainageKm}, source=${stationChainage}`
    );
  });
}
