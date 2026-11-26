package `in`.railwaymitra

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class FiveKmAlertEvaluatorTest {
    private fun report(km: Double, at: Long) = TrainMovementReport(
        trainNumber = "14704",
        direction = "UP",
        stationName = "Kolayat",
        stationKm = km,
        trainType = "passenger",
        movement = "pass",
        createdAtMs = at,
        independentReporterCount = 2
    )

    private val previous = TrainReportFeed(
        routeId = TrainReportPollingClient.EXPECTED_ROUTE_ID,
        serverTimeMs = 100_000L,
        reports = listOf(report(20.0, 100_000L))
    )
    private val current = TrainReportFeed(
        routeId = TrainReportPollingClient.EXPECTED_ROUTE_ID,
        serverTimeMs = 220_000L,
        reports = listOf(report(16.0, 220_000L))
    )

    private fun evaluate(
        armed: Boolean = true,
        routeVerified: Boolean = true,
        feedApproved: Boolean = true,
        directionSign: Int? = -1
    ) = FiveKmAlertEvaluator.evaluate(
        previousFeed = previous,
        currentFeed = current,
        userTrackKm = 12.0,
        gpsAccuracyM = 10.0,
        gpsFixAtMs = 225_000L,
        nowMs = 230_000L,
        armed = armed,
        routeGeometryProductionVerified = routeVerified,
        reportFeedProductionApproved = feedApproved,
        directionSignFor = { _, _ -> directionSign }
    )

    @Test
    fun failsClosedUntilEachProductionApprovalIsExplicit() {
        assertEquals("not_armed", evaluate(armed = false).reason)
        assertEquals("route_geometry_not_production_verified", evaluate(routeVerified = false).reason)
        assertEquals("report_feed_not_production_approved", evaluate(feedApproved = false).reason)
    }

    @Test
    fun failsClosedWithoutVerifiedDirectionMapping() {
        assertEquals("direction_mapping_not_verified", evaluate(directionSign = null).reason)
    }

    @Test
    fun delegatesConfirmedApproachToFiveKmGate() {
        val result = evaluate()
        assertTrue(result.reason, result.eligible)
        assertEquals("14704", result.trainNumber)
        assertEquals(4.0, result.distanceKm!!, 0.001)
    }

    @Test
    fun rejectsAnyTrainOutsideTheRouteTargetIdentity() {
        val otherTrain = current.copy(reports = listOf(report(16.0, 220_000L).copy(trainNumber = "14705")))
        val result = FiveKmAlertEvaluator.evaluate(
            previous, otherTrain, 12.0, 10.0, 225_000L, 230_000L,
            true, true, true
        ) { _, _ -> 1 }
        assertFalse(result.eligible)
        assertEquals("target_train_mismatch", result.reason)
    }

    @Test
    fun rejectsMissingPreviousObservationAndTrackMatch() {
        val noPrevious = FiveKmAlertEvaluator.evaluate(
            null, current, 12.0, 10.0, 225_000L, 230_000L,
            true, true, true
        ) { _, _ -> -1 }
        assertEquals("previous_report_observation_missing", noPrevious.reason)

        val noTrack = FiveKmAlertEvaluator.evaluate(
            previous, current, null, 10.0, 225_000L, 230_000L,
            true, true, true
        ) { _, _ -> -1 }
        assertEquals("user_track_match_missing", noTrack.reason)
    }

    @Test
    fun neverPairsDifferentTrainIdentityOrDirection() {
        val changed = current.copy(reports = listOf(report(16.0, 220_000L).copy(trainNumber = "14705")))
        val result = FiveKmAlertEvaluator.evaluate(
            previous, changed, 12.0, 10.0, 225_000L, 230_000L,
            true, true, true
        ) { -1 }
        assertFalse(result.eligible)
        assertEquals("target_train_mismatch", result.reason)
    }
}
