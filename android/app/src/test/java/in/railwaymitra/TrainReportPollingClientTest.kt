package in.railwaymitra

import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Test
import java.io.IOException

class TrainReportPollingClientTest {
    private fun execution(body: JSONObject, status: Int = 200): String =
        JSONObject()
            .put("responseStatusCode", status)
            .put("responseBody", body.toString())
            .toString()

    private fun validReport(now: Long = 1_000_000L): JSONObject =
        JSONObject()
            .put("alertEligible", true)
            .put("chainageVerified", true)
            .put("trainNumber", "14704")
            .put("direction", "UP")
            .put("stationName", "Kolayat")
            .put("stationKm", 46.15)
            .put("trainType", "passenger")
            .put("movement", "pass")
            .put("createdAt", now - 30_000L)
            .put("independentReporterCount", 2)

    private fun validBody(now: Long = 1_000_000L, reports: JSONArray = JSONArray().put(validReport(now))): JSONObject =
        JSONObject()
            .put("schemaVersion", 1)
            .put("routeId", TrainReportPollingClient.EXPECTED_ROUTE_ID)
            .put("serverTime", now)
            .put("reports", reports)

    @Test
    fun acceptsFreshIdentityMatchedAndCorroboratedReport() {
        val now = 1_000_000L
        val feed = TrainReportPollingClient.parseExecutionResponse(execution(validBody(now)), 201, now)

        assertEquals(TrainReportPollingClient.EXPECTED_ROUTE_ID, feed.routeId)
        assertEquals(now, feed.serverTimeMs)
        assertEquals(1, feed.reports.size)
        assertEquals("14704", feed.reports[0].trainNumber)
        assertEquals(46.15, feed.reports[0].stationKm, 0.001)
        assertEquals(160.0, feed.reports[0].maxSpeedKmh, 0.001)
    }

    @Test
    fun filtersUnverifiedOrUncorroboratedReports() {
        val now = 1_000_000L
        val rows = JSONArray()
            .put(validReport(now).put("alertEligible", false))
            .put(validReport(now).put("chainageVerified", false))
            .put(validReport(now).put("independentReporterCount", 1))
            .put(validReport(now).put("createdAt", now - 16 * 60 * 1000L))
        val feed = TrainReportPollingClient.parseExecutionResponse(execution(validBody(now, rows)), 200, now)
        assertEquals(0, feed.reports.size)
    }

    @Test
    fun rejectsWrongRouteIdentity() {
        val body = validBody().put("routeId", "OTHER-ROUTE")
        assertThrows(IOException::class.java) {
            TrainReportPollingClient.parseExecutionResponse(execution(body))
        }
    }

    @Test
    fun rejectsUnsupportedSchemaVersion() {
        val body = validBody().put("schemaVersion", 2)
        assertThrows(IOException::class.java) {
            TrainReportPollingClient.parseExecutionResponse(execution(body))
        }
    }

    @Test
    fun rejectsFunctionExecutionFailure() {
        assertThrows(IOException::class.java) {
            TrainReportPollingClient.parseExecutionResponse(execution(validBody(), 503), 201)
        }
    }

    @Test
    fun appliesGoodsTrainSpeedCeiling() {
        val now = 1_000_000L
        val goods = validReport(now).put("trainType", "goods")
        val feed = TrainReportPollingClient.parseExecutionResponse(
            execution(validBody(now, JSONArray().put(goods))),
            200,
            now
        )
        assertEquals(100.0, feed.reports.single().maxSpeedKmh, 0.001)
    }
}
