package `in`.railwaymitra

import org.json.JSONObject
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL

data class TrainMovementReport(
    val trainNumber: String,
    val direction: String,
    val stationName: String,
    val stationKm: Double,
    val trainType: String,
    val movement: String,
    val createdAtMs: Long,
    val independentReporterCount: Int
) {
    val maxSpeedKmh: Double
        get() = if (trainType == "goods") 100.0 else 160.0
}

data class TrainReportFeed(
    val routeId: String,
    val serverTimeMs: Long,
    val reports: List<TrainMovementReport>
) {
    fun toJson(): String {
        val rows = org.json.JSONArray()
        reports.forEach { report ->
            rows.put(JSONObject()
                .put("trainNumber", report.trainNumber)
                .put("direction", report.direction)
                .put("stationName", report.stationName)
                .put("stationKm", report.stationKm)
                .put("trainType", report.trainType)
                .put("movement", report.movement)
                .put("createdAt", report.createdAtMs)
                .put("independentReporterCount", report.independentReporterCount)
                .put("maxSpeedKmh", report.maxSpeedKmh))
        }
        return JSONObject()
            .put("routeId", routeId)
            .put("serverTime", serverTimeMs)
            .put("reports", rows)
            .toString()
    }
}

/**
 * Read-only, PII-free Appwrite report feed for the Android foreground service.
 * This client does not send device GPS and never sends a Firebase token.
 */
class TrainReportPollingClient(
    private val endpoint: String = "https://sgp.cloud.appwrite.io/v1",
    private val projectId: String = "6b070890000e2fca34fd",
    private val functionId: String = "train-movement-api"
) {
    fun fetchEligibleReports(): TrainReportFeed {
        val url = URL("${endpoint.trimEnd('/')}/functions/$functionId/executions")
        val connection = url.openConnection() as HttpURLConnection
        try {
            connection.requestMethod = "POST"
            connection.connectTimeout = 8000
            connection.readTimeout = 8000
            connection.doOutput = true
            connection.setRequestProperty("X-Appwrite-Project", projectId)
            connection.setRequestProperty("Content-Type", "application/json")
            val payload = JSONObject()
                .put("body", JSONObject().put("action", "public_list").put("limit", 50).toString())
                .put("async", false)
                .put("method", "POST")
                .toString()
            connection.outputStream.use { it.write(payload.toByteArray(Charsets.UTF_8)) }
            val httpStatus = connection.responseCode
            val stream = if (httpStatus in 200..299) connection.inputStream else connection.errorStream
            val raw = stream?.bufferedReader(Charsets.UTF_8)?.use { it.readText() }.orEmpty()
            return parseExecutionResponse(raw, httpStatus)
        } finally {
            connection.disconnect()
        }
    }

    companion object {
        const val EXPECTED_ROUTE_ID = "14704-lgh-phl"
        const val EXPECTED_TRAIN_NUMBER = "14704"
        const val MAX_REPORT_AGE_MS = 15 * 60 * 1000L

        fun parseExecutionResponse(raw: String, httpStatus: Int = 200, nowMs: Long? = null): TrainReportFeed {
            if (httpStatus !in 200..299) throw IOException("Appwrite execution HTTP $httpStatus")
            val execution = try {
                JSONObject(raw)
            } catch (_: Exception) {
                throw IOException("Invalid Appwrite execution response")
            }
            val functionStatus = execution.optInt("responseStatusCode", 500)
            if (functionStatus !in 200..299) {
                throw IOException("Train report feed returned HTTP $functionStatus")
            }
            val body = try {
                JSONObject(execution.optString("responseBody", "{}"))
            } catch (_: Exception) {
                throw IOException("Invalid train report feed body")
            }
            if (body.optInt("schemaVersion", -1) != 1) throw IOException("Unsupported train report feed schema")
            val routeId = body.optString("routeId", "")
            if (routeId != EXPECTED_ROUTE_ID) throw IOException("Train report route identity mismatch")
            val serverTime = body.optLong("serverTime", 0L)
            if (serverTime <= 0L) throw IOException("Missing report feed server time")
            val now = nowMs ?: serverTime
            val rows = body.optJSONArray("reports") ?: org.json.JSONArray()
            val reports = mutableListOf<TrainMovementReport>()
            for (index in 0 until rows.length()) {
                val row = rows.optJSONObject(index) ?: continue
                if (!row.optBoolean("alertEligible", false)) continue
                if (!row.optBoolean("chainageVerified", false)) continue
                val trainNumber = row.optString("trainNumber", "").trim().uppercase()
                val direction = row.optString("direction", "")
                val stationName = row.optString("stationName", "")
                val stationKm = row.optDouble("stationKm", Double.NaN)
                val trainType = row.optString("trainType", "")
                val movement = row.optString("movement", "")
                val createdAt = row.optLong("createdAt", 0L)
                val reporterCount = row.optInt("independentReporterCount", 0)
                if (!trainNumber.matches(Regex("[A-Z0-9-]{2,10}"))) continue
                if (trainNumber != EXPECTED_TRAIN_NUMBER) continue
                if (direction != "UP" && direction != "DOWN") continue
                if (stationName.isBlank() || !stationKm.isFinite() || stationKm !in 0.0..158.15) continue
                if (trainType != "passenger" && trainType != "goods") continue
                if (movement !in setOf("pass", "halt", "departure")) continue
                if (createdAt <= 0L || createdAt > now || now - createdAt > MAX_REPORT_AGE_MS) continue
                if (reporterCount < 2) continue
                reports += TrainMovementReport(
                    trainNumber, direction, stationName, stationKm,
                    trainType, movement, createdAt, reporterCount
                )
            }
            return TrainReportFeed(routeId, serverTime, reports.sortedBy { it.createdAtMs })
        }
    }
}
