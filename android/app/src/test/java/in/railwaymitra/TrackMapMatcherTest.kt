package `in`.railwaymitra

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

class TrackMapMatcherTest {
    private val assetJson = this::class.java.getResourceAsStream("/route-lgh-plc-candidate.json")!!.bufferedReader().use { it.readText() }
    private val matcher = TrackMapMatcher(assetJson)

    @Test
    fun mapsKolayatGpsToSourceChainage() {
        val result = matcher.matchGpsToRoute(
            latitude = 27.836207,
            longitude = 72.9558,
            accuracyM = 5.0,
            gpsFixAtMs = 100_000L,
            nowMs = 100_000L
        )
        assertTrue(result.reason, result.matched)
        assertEquals(46.15, result.chainageKm!!, 0.5)
        assertTrue(result.crossTrackDistanceM!! <= 100.0)
        assertEquals("NOT_PRODUCTION_VERIFIED", result.candidateStatus)
    }

    @Test
    fun rejectsStaleGpsFix() {
        val result = matcher.matchGpsToRoute(
            latitude = 27.836207,
            longitude = 72.9558,
            accuracyM = 5.0,
            gpsFixAtMs = 100_000L,
            nowMs = 140_001L
        )
        assertFalse(result.matched)
        assertEquals("gps_fix_stale", result.reason)
    }

    @Test
    fun rejectsPoorGpsAccuracy() {
        val result = matcher.matchGpsToRoute(
            latitude = 27.836207,
            longitude = 72.9558,
            accuracyM = 75.0,
            gpsFixAtMs = 100_000L,
            nowMs = 100_000L
        )
        assertFalse(result.matched)
        assertEquals("gps_accuracy_insufficient", result.reason)
    }

    @Test
    fun rejectsWrongRouteIdentity() {
        val result = matcher.matchGpsToRoute(
            latitude = 27.836207,
            longitude = 72.9558,
            accuracyM = 5.0,
            gpsFixAtMs = 100_000L,
            nowMs = 100_000L,
            routeId = "OTHER"
        )
        assertFalse(result.matched)
        assertEquals("route_mismatch", result.reason)
    }

    @Test
    fun rejectsGpsFarFromCandidateTrack() {
        val result = matcher.matchGpsToRoute(
            latitude = 28.5,
            longitude = 73.3,
            accuracyM = 5.0,
            gpsFixAtMs = 100_000L,
            nowMs = 100_000L
        )
        assertFalse(result.matched)
        assertEquals("gps_off_candidate_route", result.reason)
    }

    @Test
    fun phalodiStationCentreIsNotAcceptedWithProductionOffsetThreshold() {
        val result = matcher.matchGpsToRoute(
            latitude = 27.1154833,
            longitude = 72.3939194,
            accuracyM = 5.0,
            gpsFixAtMs = 100_000L,
            nowMs = 100_000L
        )
        assertFalse(result.matched)
        assertEquals("gps_off_candidate_route", result.reason)
    }

    @Test
    fun phalodiStationAnchorCanBeMeasuredOnlyWithExplicitQaTolerance() {
        val result = matcher.matchGpsToRoute(
            latitude = 27.1154833,
            longitude = 72.3939194,
            accuracyM = 5.0,
            gpsFixAtMs = 100_000L,
            nowMs = 100_000L,
            maxTrackOffsetM = 500.0
        )
        assertTrue(result.reason, result.matched)
        assertEquals(155.655, result.chainageKm!!, 0.5)
        assertNotNull(result.crossTrackDistanceM)
        assertTrue(result.crossTrackDistanceM!! > 100.0)
    }
}
