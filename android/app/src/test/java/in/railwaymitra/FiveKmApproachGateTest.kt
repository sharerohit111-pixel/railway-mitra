package `in`.railwaymitra

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class FiveKmApproachGateTest {
    private val base = FiveKmApproachInput(
        armed = true,
        routeGeometryProductionVerified = true,
        reportFeedProductionApproved = true,
        reportRouteId = "14704-lgh-phl",
        trackRouteId = "LGH-PLC",
        previousTrainNumber = "14704",
        currentTrainNumber = "14704",
        previousDirection = "UP",
        currentDirection = "UP",
        previousIndependentReporterCount = 2,
        currentIndependentReporterCount = 2,
        previousTrainKm = 14.0,
        currentTrainKm = 16.0,
        trainDirectionSign = 1,
        previousReportAtMs = 100_000L,
        currentReportAtMs = 220_000L,
        userTrackKm = 20.0,
        gpsAccuracyM = 12.0,
        gpsFixAtMs = 225_000L,
        nowMs = 230_000L
    )

    @Test
    fun allowsOnlyConfirmedApproachCrossingIntoFiveKm() {
        val result = FiveKmApproachGate.evaluate(base)
        assertTrue(result.reason, result.eligible)
        assertEquals(4.0, result.distanceKm!!, 0.001)
        assertEquals(6.0, result.previousDistanceKm!!, 0.001)
        assertEquals(60.0, result.observedAverageSpeedKmh!!, 0.1)
    }

    @Test
    fun failsClosedWithoutProductionApproval() {
        assertEquals(
            "route_geometry_not_production_verified",
            FiveKmApproachGate.evaluate(base.copy(routeGeometryProductionVerified = false)).reason
        )
        assertEquals(
            "report_feed_not_production_approved",
            FiveKmApproachGate.evaluate(base.copy(reportFeedProductionApproved = false)).reason
        )
    }

    @Test
    fun rejectsWrongRouteIdentity() {
        assertEquals("route_mismatch", FiveKmApproachGate.evaluate(base.copy(trackRouteId = "OTHER")).reason)
        assertEquals("route_mismatch", FiveKmApproachGate.evaluate(base.copy(reportRouteId = "OTHER")).reason)
    }

    @Test
    fun rejectsAValidButWrongTrainOnThisRoute() {
        assertEquals(
            "train_identity_mismatch",
            FiveKmApproachGate.evaluate(base.copy(currentTrainNumber = "14705")).reason
        )
    }

    @Test
    fun rejectsMissingOrMismatchedTrainIdentity() {
        assertEquals(
            "train_identity_missing",
            FiveKmApproachGate.evaluate(base.copy(previousTrainNumber = null)).reason
        )
        assertEquals(
            "train_identity_mismatch",
            FiveKmApproachGate.evaluate(base.copy(currentTrainNumber = "14705")).reason
        )
    }

    @Test
    fun rejectsDirectionAndIndependentReporterMismatch() {
        assertEquals(
            "train_direction_changed",
            FiveKmApproachGate.evaluate(base.copy(currentDirection = "DOWN")).reason
        )
        assertEquals(
            "independent_reports_insufficient",
            FiveKmApproachGate.evaluate(base.copy(currentIndependentReporterCount = 1)).reason
        )
    }

    @Test
    fun rejectsStaleGpsAndReports() {
        assertEquals(
            "gps_fix_stale",
            FiveKmApproachGate.evaluate(base.copy(gpsFixAtMs = 1L)).reason
        )
        assertEquals(
            "train_report_stale",
            FiveKmApproachGate.evaluate(base.copy(currentReportAtMs = 1L)).reason
        )
    }

    @Test
    fun rejectsImplausibleSpeedAndLongReportIntervals() {
        assertEquals(
            "observed_speed_implausible",
            FiveKmApproachGate.evaluate(base.copy(currentReportAtMs = 130_000L, gpsFixAtMs = 135_000L, nowMs = 140_000L)).reason
        )
        assertEquals(
            "report_interval_invalid",
            FiveKmApproachGate.evaluate(base.copy(currentReportAtMs = 1_001_000L, gpsFixAtMs = 1_006_000L, nowMs = 1_010_000L)).reason
        )
    }

    @Test
    fun rejectsMovingAwayAndNonCrossingObservations() {
        assertEquals("train_not_confirmed_approaching", FiveKmApproachGate.evaluate(base.copy(currentTrainKm = 12.0)).reason)
        assertEquals(
            "five_km_threshold_not_crossed",
            FiveKmApproachGate.evaluate(base.copy(previousTrainKm = 10.0, currentTrainKm = 12.0)).reason
        )
    }
}
