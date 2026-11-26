package `in`.railwaymitra

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class SpeedBasedTrainEstimatorTest {
    @Test
    fun passengerTrainUses105KmhAndAlertsAtFiveKm() {
        // Phalodi 158 km -> Malar 145 km; after 8/105 hours it is 5 km before Malar.
        val departure = TrainDeparture("report-1", "passenger", 158.0, 1_000_000L, -1)
        val now = departure.departureAtMs + ((8.0 / 105.0) * 3_600_000.0).toLong()
        val result = SpeedBasedTrainEstimator.evaluate(departure, 145.0, now)
        assertTrue(result.reason, result.eligible)
        assertEquals(150.0, result.estimatedTrainKm!!, 0.01)
        assertEquals(5.0, result.directionalDistanceKm!!, 0.01)
        assertEquals(105.0, result.estimatedSpeedKmh!!, 0.0)
    }

    @Test
    fun goodsTrainUses60Kmh() {
        val departure = TrainDeparture("report-2", "goods", 158.0, 1_000_000L, -1)
        val now = departure.departureAtMs + 8 * 60_000L
        val result = SpeedBasedTrainEstimator.evaluate(departure, 145.0, now)
        assertTrue(result.reason, result.eligible)
        assertEquals(150.0, result.estimatedTrainKm!!, 0.01)
        assertEquals(60.0, result.estimatedSpeedKmh!!, 0.0)
    }

    @Test
    fun doesNotAlertBeforeTrainIsWithinFiveKm() {
        val departure = TrainDeparture("report-3", "passenger", 158.0, 1_000_000L, -1)
        val now = departure.departureAtMs + 3 * 60_000L
        val result = SpeedBasedTrainEstimator.evaluate(departure, 145.0, now)
        assertFalse(result.eligible)
        assertEquals("train_not_within_alert_radius", result.reason)
    }

    @Test
    fun rejectsStaleOrInvalidDepartureAndMissingGpsMatch() {
        val departure = TrainDeparture("report-4", "passenger", 158.0, 1_000_000L, -1)
        assertEquals("departure_observation_stale",
            SpeedBasedTrainEstimator.evaluate(departure, 145.0, departure.departureAtMs + 7 * 3_600_000L).reason)
        assertEquals("user_track_match_missing",
            SpeedBasedTrainEstimator.evaluate(departure, null, departure.departureAtMs + 1_000L).reason)
        assertEquals("train_type_invalid",
            SpeedBasedTrainEstimator.evaluate(departure.copy(trainType = "unknown"), 145.0, departure.departureAtMs + 1_000L).reason)
    }
}
