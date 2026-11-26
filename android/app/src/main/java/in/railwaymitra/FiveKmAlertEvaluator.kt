package `in`.railwaymitra

/**
 * Pairs consecutive public-feed observations for the same train and delegates
 * threshold/speed/freshness checks to FiveKmApproachGate.
 *
 * Production approvals and the train-number-specific timetable direction are
 * explicit inputs. A missing mapping or approval always fails closed.
 */
data class FiveKmAlertEvaluation(
    val eligible: Boolean,
    val reason: String,
    val trainNumber: String? = null,
    val distanceKm: Double? = null
)

object FiveKmAlertEvaluator {
    const val EXPECTED_TRAIN_NUMBER = "14704"
    fun evaluate(
        previousFeed: TrainReportFeed?,
        currentFeed: TrainReportFeed,
        userTrackKm: Double?,
        gpsAccuracyM: Double,
        gpsFixAtMs: Long,
        nowMs: Long,
        armed: Boolean,
        routeGeometryProductionVerified: Boolean,
        reportFeedProductionApproved: Boolean,
        directionSignFor: (String, String) -> Int?
    ): FiveKmAlertEvaluation {
        fun fail(reason: String) = FiveKmAlertEvaluation(false, reason)
        if (!armed) return fail("not_armed")
        if (!routeGeometryProductionVerified) return fail("route_geometry_not_production_verified")
        if (!reportFeedProductionApproved) return fail("report_feed_not_production_approved")
        if (previousFeed == null) return fail("previous_report_observation_missing")
        if (previousFeed.routeId != currentFeed.routeId) return fail("report_route_changed")
        if (userTrackKm == null || !userTrackKm.isFinite()) return fail("user_track_match_missing")

        val previousByIdentity = previousFeed.reports
            .associateBy { it.trainNumber to it.direction }
        var lastFailure = "matching_train_observation_missing"
        for (current in currentFeed.reports.sortedByDescending { it.createdAtMs }) {
            if (current.trainNumber != EXPECTED_TRAIN_NUMBER) {
                lastFailure = "target_train_mismatch"
                continue
            }
            val previous = previousByIdentity[current.trainNumber to current.direction] ?: continue
            val directionSign = directionSignFor(current.trainNumber, current.direction)
            if (directionSign != 1 && directionSign != -1) {
                lastFailure = "direction_mapping_not_verified"
                continue
            }
            val result = FiveKmApproachGate.evaluate(
                FiveKmApproachInput(
                    armed = armed,
                    routeGeometryProductionVerified = routeGeometryProductionVerified,
                    reportFeedProductionApproved = reportFeedProductionApproved,
                    reportRouteId = currentFeed.routeId,
                    trackRouteId = TrackMapMatcher.EXPECTED_ROUTE_ID,
                    previousTrainNumber = previous.trainNumber,
                    currentTrainNumber = current.trainNumber,
                    expectedTrainNumber = EXPECTED_TRAIN_NUMBER,
                    previousDirection = previous.direction,
                    currentDirection = current.direction,
                    previousIndependentReporterCount = previous.independentReporterCount,
                    currentIndependentReporterCount = current.independentReporterCount,
                    previousTrainKm = previous.stationKm,
                    currentTrainKm = current.stationKm,
                    trainDirectionSign = directionSign,
                    previousReportAtMs = previous.createdAtMs,
                    currentReportAtMs = current.createdAtMs,
                    userTrackKm = userTrackKm,
                    gpsAccuracyM = gpsAccuracyM,
                    gpsFixAtMs = gpsFixAtMs,
                    nowMs = nowMs,
                    maxSpeedKmh = minOf(previous.maxSpeedKmh, current.maxSpeedKmh)
                )
            )
            if (result.eligible) {
                return FiveKmAlertEvaluation(true, result.reason, current.trainNumber, result.distanceKm)
            }
            lastFailure = result.reason
        }
        return fail(lastFailure)
    }
}
