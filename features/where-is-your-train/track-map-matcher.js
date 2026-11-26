/**
 * GPS-to-track projection for the source-derived LGH-PLC route candidate.
 *
 * This module only returns a conservative map-match result. It does not poll
 * train reports, decide train direction, arm alarms, or trigger notifications.
 */
const EARTH_RADIUS_M = 6371008.8;

const radians = value => value * Math.PI / 180;
const finite = value => typeof value === "number" && Number.isFinite(value);

export function haversineMeters(a, b) {
  const [lon1, lat1] = a;
  const [lon2, lat2] = b;
  const dLat = radians(lat2 - lat1);
  const dLon = radians(lon2 - lon1);
  const lat1Rad = radians(lat1);
  const lat2Rad = radians(lat2);
  const h = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1Rad) * Math.cos(lat2Rad) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(Math.min(1, h)));
}

function validateCalibration(calibration, routeLengthM) {
  if (!Array.isArray(calibration) || calibration.length === 0) return "chainage_calibration_missing";
  let previousMeasure = 0;
  let previousChainage = null;

  for (let i = 0; i < calibration.length; i += 1) {
    const row = calibration[i];
    if (!row || ![
      row.measure_from_m, row.measure_to_m,
      row.chainage_from_km, row.chainage_to_km
    ].every(finite)) return "chainage_calibration_invalid";
    if (row.measure_to_m <= row.measure_from_m
      || row.chainage_to_km <= row.chainage_from_km) return "chainage_calibration_invalid";
    if (i === 0 && Math.abs(row.measure_from_m) > 1) return "chainage_calibration_start_gap";
    if (i > 0 && Math.abs(row.measure_from_m - previousMeasure) > 1) return "chainage_calibration_measure_gap";
    if (i > 0 && Math.abs(row.chainage_from_km - previousChainage) > 0.001) {
      return "chainage_calibration_km_gap";
    }
    previousMeasure = row.measure_to_m;
    previousChainage = row.chainage_to_km;
  }

  if (Math.abs(previousMeasure - routeLengthM) > Math.max(100, routeLengthM * 0.002)) {
    return "chainage_calibration_length_mismatch";
  }
  return null;
}

function interpolateChainage(measureM, calibration) {
  const row = calibration.find(item =>
    measureM >= item.measure_from_m - 1
    && measureM <= item.measure_to_m + 1
  );
  if (!row) return null;
  const fraction = Math.max(0, Math.min(
    1,
    (measureM - row.measure_from_m) / (row.measure_to_m - row.measure_from_m)
  ));
  return row.chainage_from_km
    + fraction * (row.chainage_to_km - row.chainage_from_km);
}

/**
 * @param {object} input
 * @param {number} input.latitude GPS latitude in WGS84
 * @param {number} input.longitude GPS longitude in WGS84
 * @param {number} input.accuracyM Android/browser horizontal accuracy in metres
 * @param {number} input.gpsFixAt GPS timestamp in Unix milliseconds
 * @param {number} [input.now=Date.now()]
 * @param {string} input.routeId selected route identity
 * @param {string} input.expectedRouteId expected route identity
 * @param {object} input.routeFeature GeoJSON Feature with LineString geometry and chainage_calibration
 */
export function matchGpsToRoute({
  latitude,
  longitude,
  accuracyM,
  gpsFixAt,
  now = Date.now(),
  routeId,
  expectedRouteId,
  routeFeature,
  maxAgeMs = 30000,
  maxAccuracyM = 50,
  maxTrackOffsetM = 100,
  ambiguityDistanceDeltaM = 5,
  ambiguityChainageDeltaKm = 0.2
} = {}) {
  const fail = reason => ({ matched: false, reason });
  if (!routeId || routeId !== expectedRouteId) return fail("route_mismatch");
  if (![latitude, longitude].every(finite)
    || latitude < -90 || latitude > 90
    || longitude < -180 || longitude > 180) return fail("gps_coordinate_invalid");
  if (!finite(accuracyM) || accuracyM < 0 || accuracyM > maxAccuracyM) {
    return fail("gps_accuracy_insufficient");
  }
  if (!finite(gpsFixAt) || !finite(now) || gpsFixAt > now) return fail("gps_timestamp_invalid");
  if (now - gpsFixAt > maxAgeMs) return fail("gps_fix_stale");

  if (routeFeature?.properties?.route !== routeId) return fail("route_feature_identity_mismatch");
  const geometry = routeFeature?.geometry;
  const calibration = routeFeature?.properties?.chainage_calibration;
  if (geometry?.type !== "LineString"
    || !Array.isArray(geometry.coordinates)
    || geometry.coordinates.length < 2) return fail("route_geometry_invalid");

  const coordinates = geometry.coordinates;
  if (coordinates.some(point =>
    !Array.isArray(point) || point.length < 2
    || !finite(point[0]) || !finite(point[1])
    || point[0] < -180 || point[0] > 180
    || point[1] < -90 || point[1] > 90
  )) return fail("route_coordinate_invalid");

  const segmentLengths = [];
  let routeLengthM = 0;
  for (let i = 0; i < coordinates.length - 1; i += 1) {
    const length = haversineMeters(coordinates[i], coordinates[i + 1]);
    if (!finite(length) || length <= 0) return fail("route_segment_invalid");
    segmentLengths.push(length);
    routeLengthM += length;
  }

  const calibrationError = validateCalibration(calibration, routeLengthM);
  if (calibrationError) return fail(calibrationError);
  const calibrationLengthM = calibration[calibration.length - 1].measure_to_m;
  const measureScale = calibrationLengthM / routeLengthM;

  // Local tangent-plane projection around the GPS fix; segment lengths remain
  // haversine-based and the final measure is scaled to source UTM calibration.
  const cosLatitude = Math.cos(radians(latitude));
  const projectLocal = point => ({
    x: EARTH_RADIUS_M * radians(point[0] - longitude) * cosLatitude,
    y: EARTH_RADIUS_M * radians(point[1] - latitude)
  });

  let cumulativeM = 0;
  const candidates = [];
  for (let i = 0; i < coordinates.length - 1; i += 1) {
    const a = projectLocal(coordinates[i]);
    const b = projectLocal(coordinates[i + 1]);
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const denominator = dx * dx + dy * dy;
    const t = denominator > 0
      ? Math.max(0, Math.min(1, -(a.x * dx + a.y * dy) / denominator))
      : 0;
    const nearestX = a.x + t * dx;
    const nearestY = a.y + t * dy;
    const distanceM = Math.hypot(nearestX, nearestY);
    const rawMeasureM = cumulativeM + t * segmentLengths[i];
    const calibratedMeasureM = rawMeasureM * measureScale;
    const chainageKm = interpolateChainage(calibratedMeasureM, calibration);
    if (chainageKm == null) return fail("chainage_calibration_unmapped");
    candidates.push({
      distanceM,
      rawMeasureM,
      calibratedMeasureM,
      chainageKm,
      segmentIndex: i
    });
    cumulativeM += segmentLengths[i];
  }

  candidates.sort((a, b) => a.distanceM - b.distanceM);
  const best = candidates[0];
  const second = candidates[1];
  if (!best || best.distanceM > maxTrackOffsetM) return fail("gps_off_candidate_route");

  if (second
    && second.distanceM - best.distanceM <= ambiguityDistanceDeltaM
    && Math.abs(second.chainageKm - best.chainageKm) > ambiguityChainageDeltaKm) {
    return fail("ambiguous_track_match");
  }

  return {
    matched: true,
    reason: "gps_matched_to_route",
    routeId,
    chainageKm: Number(best.chainageKm.toFixed(3)),
    routeMeasureM: Number(best.calibratedMeasureM.toFixed(1)),
    crossTrackDistanceM: Number(best.distanceM.toFixed(1)),
    gpsAccuracyM: Number(accuracyM.toFixed(1)),
    gpsFixAt,
    segmentIndex: best.segmentIndex
  };
}
