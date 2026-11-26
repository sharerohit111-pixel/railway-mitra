package `in`.railwaymitra

data class FiveKmApproachInput(
    val armed: Boolean = false,
    val routeGeometryProductionVerified: Boolean = false,
    val reportFeedProductionApproved: Boolean = false,
    val reportRouteId: String,
    val expectedReportRouteId: String = "14704-lgh-phl",
    val trackRouteId: String,
    val expectedTrackRouteId: String = TrackMapMatcher.EXPECTED_ROUTE_ID,
    val previousTrainNumber: String?,
    val currentTrainNumber: String?,
    val previousDirection: String?,
    val currentDirection: String?,
    val previousIndependentReporterCount: Int,
    val currentIndependentReporterCount: Int,
    val previousTrainKm: Double,
    val currentTrainKm: Double,
    val trainDirectionSign: Int,
    val previousReportAtMs: Long,
    val currentReportAtMs: Long,
    val userTrackKm: Double,
    val gpsAccuracyM: Double,
    val gpsFixAtMs: Long,
    val nowMs: Long,
    val radiusKm: Double = 5.0,
    val maxReportIntervalMs: Long = 900_000L,
    val maxSpeedKmh: Double = 160.0,
    val minObservedSpeedKmh: Double = 0.5
)

data class FiveKmApproachResult(
    val eligible: Boolean,
    val reason: String,
    val distanceKm: Double? = null,
    val previousDistanceKm: Double? = null,
    val observedAverageSpeedKmh: Double? = null
)

object FiveKmApproachGate {
    fun evaluate(input: FiveKmApproachInput): FiveKmApproachResult {
        fun fail(reason: String) = FiveKmApproachResult(false, reason)
        if (!input.armed) return fail("not_armed")
        if (!input.routeGeometryProductionVerified) return fail("route_geometry_not_production_verified")
        if (!input.reportFeedProductionApproved) return fail("report_feed_not_production_approved")

        val previousIdentity = input.previousTrainNumber?.trim()?.uppercase().orEmpty()
        val currentIdentity = input.currentTrainNumber?.trim()?.uppercase().orEmpty()
        if (previousIdentity.isBlank() || currentIdentity.isBlank()) return fail("train_identity_missing")
        if (previousIdentity != currentIdentity) return fail("train_identity_mismatch")
        if ((input.previousDirection != "UP" && input.previousDirection != "DOWN")
            || (input.currentDirection != "UP" && input.currentDirection != "DOWN")) {
            return fail("unknown_direction")
        }
        if (input.previousDirection != input.currentDirection) return fail("train_direction_changed")
        if (input.previousIndependentReporterCount < 2 || input.currentIndependentReporterCount < 2) {
            return fail("independent_reports_insufficient")
        }
        if (input.reportRouteId != input.expectedReportRouteId || input.trackRouteId != input.expectedTrackRouteId) {
            return fail("route_mismatch")
        }
        if (input.trainDirectionSign != 1 && input.trainDirectionSign != -1) return fail("unknown_direction")

        val numericValues = listOf(
            input.previousTrainKm, input.currentTrainKm, input.userTrackKm,
            input.gpsAccuracyM, input.radiusKm, input.maxSpeedKmh, input.minObservedSpeedKmh
        )
        if (numericValues.any { !it.isFinite() }) return fail("invalid_input")
        if (input.gpsAccuracyM < 0.0 || input.gpsAccuracyM > 50.0) return fail("gps_accuracy_insufficient")
        if (input.gpsFixAtMs <= 0L || input.gpsFixAtMs > input.nowMs || input.nowMs - input.gpsFixAtMs > 30_000L) {
            return fail("gps_fix_stale")
        }
        if (input.currentReportAtMs <= 0L || input.nowMs < input.currentReportAtMs
            || input.nowMs - input.currentReportAtMs > 60_000L) return fail("train_report_stale")
        if (input.previousReportAtMs <= 0L || input.maxReportIntervalMs <= 0L) return fail("report_interval_invalid")
        val reportIntervalMs = input.currentReportAtMs - input.previousReportAtMs
        if (reportIntervalMs <= 0L || reportIntervalMs > input.maxReportIntervalMs) return fail("report_interval_invalid")
        if (input.maxSpeedKmh <= 0.0 || input.maxSpeedKmh > 220.0 || input.minObservedSpeedKmh < 0.0 || input.minObservedSpeedKmh > input.maxSpeedKmh) {
            return fail("speed_limit_invalid")
        }
        if (input.previousTrainKm < 0.0 || input.currentTrainKm < 0.0 || input.userTrackKm < 0.0 || input.radiusKm <= 0.0) {
            return fail("chainage_invalid")
        }

        val movementKm = (input.currentTrainKm - input.previousTrainKm) * input.trainDirectionSign
        if (movementKm <= 0.0) return fail("train_not_confirmed_approaching")
        val observedAverageSpeedKmh = movementKm / (reportIntervalMs / 3_600_000.0)
        if (observedAverageSpeedKmh < input.minObservedSpeedKmh || observedAverageSpeedKmh > input.maxSpeedKmh) {
            return fail("observed_speed_implausible")
        }

        val previousDistanceKm = abs(input.userTrackKm - input.previousTrainKm)
        val currentDistanceKm = abs(input.userTrackKm - input.currentTrainKm)
        if (currentDistanceKm >= previousDistanceKm) return fail("distance_not_decreasing")
        if (previousDistanceKm <= input.radiusKm || currentDistanceKm > input.radiusKm) {
            return fail("five_km_threshold_not_crossed")
        }

        return FiveKmApproachResult(
            eligible = true,
            reason = "approach_threshold_crossed",
            distanceKm = round3(currentDistanceKm),
            previousDistanceKm = round3(previousDistanceKm),
            observedAverageSpeedKmh = round1(observedAverageSpeedKmh)
        )
    }

    private fun round1(value: Double) = kotlin.math.round(value * 10.0) / 10.0
    private fun round3(value: Double) = kotlin.math.round(value * 1000.0) / 1000.0
}
