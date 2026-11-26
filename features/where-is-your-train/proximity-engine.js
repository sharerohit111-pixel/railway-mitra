/**
 * Conservative 5 km approach gate.
 * This module accepts already map-matched route chainage; it does not map GPS
 * coordinates to railway tracks and must not be treated as a complete alert.
 */
export function evaluateFiveKmApproach({
  armed = false,
  routeId,
  expectedRouteId,
  previousTrainNumber,
  currentTrainNumber,
  previousDirection,
  currentDirection,
  previousTrainKm,
  currentTrainKm,
  trainDirectionSign,
  previousReportAt,
  currentReportAt,
  userTrackKm,
  gpsAccuracyM,
  gpsFixAt,
  now = Date.now(),
  radiusKm = 5,
  maxReportIntervalMs = 900000,
  maxSpeedKmh = 160,
  minObservedSpeedKmh = 0.5
} = {}) {
  const fail = reason => ({ eligible: false, reason });
  if (!armed) return fail("not_armed");
  const previousIdentity = typeof previousTrainNumber === "string" ? previousTrainNumber.trim().toUpperCase() : "";
  const currentIdentity = typeof currentTrainNumber === "string" ? currentTrainNumber.trim().toUpperCase() : "";
  if (!previousIdentity || !currentIdentity) return fail("train_identity_missing");
  if (previousIdentity !== currentIdentity) return fail("train_identity_mismatch");
  if (!["UP", "DOWN"].includes(previousDirection) || !["UP", "DOWN"].includes(currentDirection)) return fail("unknown_direction");
  if (previousDirection !== currentDirection) return fail("train_direction_changed");
  if (!routeId || routeId !== expectedRouteId) return fail("route_mismatch");
  if (![previousTrainKm, currentTrainKm, userTrackKm, previousReportAt, currentReportAt, gpsFixAt, now].every(Number.isFinite)) return fail("invalid_input");
  if (![1, -1].includes(trainDirectionSign)) return fail("unknown_direction");
  if (gpsAccuracyM == null || !Number.isFinite(gpsAccuracyM) || gpsAccuracyM > 50) return fail("gps_accuracy_insufficient");
  if (now - gpsFixAt < 0 || now - gpsFixAt > 30000) return fail("gps_fix_stale");
  if (now - currentReportAt < 0 || now - currentReportAt > 60000) return fail("train_report_stale");
  const reportIntervalMs = currentReportAt - previousReportAt;
  if (reportIntervalMs <= 0 || reportIntervalMs > maxReportIntervalMs) return fail("report_interval_invalid");
  if (!Number.isFinite(maxSpeedKmh) || maxSpeedKmh <= 0 || maxSpeedKmh > 220) return fail("speed_limit_invalid");
  if (previousTrainKm < 0 || currentTrainKm < 0 || userTrackKm < 0) return fail("chainage_invalid");

  const movementKm = (currentTrainKm - previousTrainKm) * trainDirectionSign;
  if (movementKm <= 0) return fail("train_not_confirmed_approaching");
  // This is an average inferred from two timestamped reports, not a live speed sensor.
  const observedAverageSpeedKmh = movementKm / (reportIntervalMs / 3600000);
  if (observedAverageSpeedKmh < minObservedSpeedKmh || observedAverageSpeedKmh > maxSpeedKmh) {
    return fail("observed_speed_implausible");
  }
  const previousDistanceKm = Math.abs(userTrackKm - previousTrainKm);
  const currentDistanceKm = Math.abs(userTrackKm - currentTrainKm);
  if (currentDistanceKm >= previousDistanceKm) return fail("distance_not_decreasing");
  if (previousDistanceKm <= radiusKm || currentDistanceKm > radiusKm) return fail("five_km_threshold_not_crossed");

  return {
    eligible: true,
    reason: "approach_threshold_crossed",
    distanceKm: Number(currentDistanceKm.toFixed(3)),
    previousDistanceKm: Number(previousDistanceKm.toFixed(3)),
    observedAverageSpeedKmh: Number(observedAverageSpeedKmh.toFixed(1))
  };
}
