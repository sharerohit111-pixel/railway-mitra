package `in`.railwaymitra

/**
 * Predicts a train's chainage from a verified departure observation.
 * This is an estimate, not live train telemetry.
 */
data class TrainDeparture(
    val reportId: String,
    val trainType: String,
    val departureKm: Double,
    val departureAtMs: Long,
    val directionSign: Int
)

data class EstimatedTrainApproach(
    val eligible: Boolean,
    val reason: String,
    val estimatedTrainKm: Double? = null,
    val directionalDistanceKm: Double? = null,
    val estimatedSpeedKmh: Double? = null
)

object SpeedBasedTrainEstimator {
    const val PASSENGER_SPEED_KMH = 105.0
    const val GOODS_SPEED_KMH = 60.0
    const val DEFAULT_ALERT_RADIUS_KM = 5.0
    const val MAX_DEPARTURE_AGE_MS = 6 * 60 * 60 * 1000L

    fun evaluate(
        departure: TrainDeparture,
        userTrackKm: Double?,
        nowMs: Long,
        alertRadiusKm: Double = DEFAULT_ALERT_RADIUS_KM
    ): EstimatedTrainApproach {
        fun fail(reason: String) = EstimatedTrainApproach(false, reason)
        if (departure.reportId.isBlank()) return fail("departure_identity_missing")
        if (departure.trainType != "passenger" && departure.trainType != "goods") return fail("train_type_invalid")
        if (departure.directionSign != 1 && departure.directionSign != -1) return fail("direction_invalid")
        if (!departure.departureKm.isFinite() || departure.departureKm !in 0.0..158.15) return fail("departure_km_invalid")
        if (departure.departureAtMs <= 0L || departure.departureAtMs > nowMs) return fail("departure_time_invalid")
        if (nowMs - departure.departureAtMs > MAX_DEPARTURE_AGE_MS) return fail("departure_observation_stale")
        if (userTrackKm == null || !userTrackKm.isFinite() || userTrackKm !in 0.0..158.15) return fail("user_track_match_missing")
        if (!alertRadiusKm.isFinite() || alertRadiusKm <= 0.0 || alertRadiusKm > 20.0) return fail("alert_radius_invalid")

        val speed = if (departure.trainType == "passenger") PASSENGER_SPEED_KMH else GOODS_SPEED_KMH
        val elapsedHours = (nowMs - departure.departureAtMs) / 3_600_000.0
        val estimatedTrainKm = departure.departureKm + departure.directionSign * speed * elapsedHours
        if (estimatedTrainKm !in 0.0..158.15) return fail("estimated_train_outside_route")

        // Positive distance means the train is still ahead of the user in its direction of travel.
        val distanceAhead = (userTrackKm - estimatedTrainKm) * departure.directionSign
        if (distanceAhead < -0.05) return fail("train_estimate_already_passed_user")
        if (distanceAhead > alertRadiusKm) return fail("train_not_within_alert_radius")

        return EstimatedTrainApproach(
            eligible = true,
            reason = "estimated_train_within_alert_radius",
            estimatedTrainKm = round3(estimatedTrainKm),
            directionalDistanceKm = round3(distanceAhead.coerceAtLeast(0.0)),
            estimatedSpeedKmh = speed
        )
    }

    private fun round3(value: Double) = kotlin.math.round(value * 1000.0) / 1000.0
}
