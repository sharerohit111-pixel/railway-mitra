package `in`.railwaymitra

import android.content.Context
import java.util.Base64
import org.json.JSONObject
import kotlin.math.*

data class TrackMapMatchResult(
    val matched: Boolean,
    val reason: String,
    val routeId: String = "LGH-PLC",
    val chainageKm: Double? = null,
    val crossTrackDistanceM: Double? = null,
    val gpsAccuracyM: Double? = null,
    val gpsFixAtMs: Long? = null,
    val segmentIndex: Int? = null,
    val candidateStatus: String = "NOT_PRODUCTION_VERIFIED"
)

class TrackMapMatcher private constructor(private val assetJsonLoader: () -> String) {
    constructor(context: Context) : this({
        context.applicationContext.assets.open(ASSET_NAME).bufferedReader(Charsets.UTF_8).use { it.readText() }
    })

    internal constructor(assetJson: String) : this({ assetJson })
    private data class Point(val longitude: Double, val latitude: Double)
    private data class Calibration(
        val measureFromM: Double,
        val measureToM: Double,
        val chainageFromKm: Double,
        val chainageToKm: Double
    )
    private data class Candidate(
        val distanceM: Double,
        val calibratedMeasureM: Double,
        val chainageKm: Double,
        val segmentIndex: Int
    )
    private data class RouteData(
        val routeId: String,
        val candidateStatus: String,
        val points: List<Point>,
        val calibration: List<Calibration>,
        val alertRouteEndChainageKm: Double
    )

    private val route: RouteData by lazy { loadRoute() }

    fun matchGpsToRoute(
        latitude: Double,
        longitude: Double,
        accuracyM: Double,
        gpsFixAtMs: Long,
        nowMs: Long = System.currentTimeMillis(),
        routeId: String = EXPECTED_ROUTE_ID,
        maxAgeMs: Long = 30_000L,
        maxAccuracyM: Double = 50.0,
        maxTrackOffsetM: Double = 100.0,
        ambiguityDistanceDeltaM: Double = 5.0,
        ambiguityChainageDeltaKm: Double = 0.2
    ): TrackMapMatchResult {
        fun fail(reason: String) = TrackMapMatchResult(false, reason, routeId = routeId, gpsAccuracyM = accuracyM, gpsFixAtMs = gpsFixAtMs, candidateStatus = route.candidateStatus)
        if (routeId != EXPECTED_ROUTE_ID || route.routeId != routeId) return fail("route_mismatch")
        if (!latitude.isFinite() || !longitude.isFinite()
            || latitude !in -90.0..90.0 || longitude !in -180.0..180.0) return fail("gps_coordinate_invalid")
        if (!accuracyM.isFinite() || accuracyM < 0.0 || accuracyM > maxAccuracyM) return fail("gps_accuracy_insufficient")
        if (gpsFixAtMs <= 0L || gpsFixAtMs > nowMs) return fail("gps_timestamp_invalid")
        if (nowMs - gpsFixAtMs > maxAgeMs) return fail("gps_fix_stale")
        if (route.points.size < 2) return fail("route_geometry_invalid")

        val segmentLengths = ArrayList<Double>(route.points.size - 1)
        var routeLengthM = 0.0
        for (index in 0 until route.points.lastIndex) {
            val length = haversineMeters(route.points[index], route.points[index + 1])
            if (!length.isFinite() || length <= 0.0) return fail("route_segment_invalid")
            segmentLengths += length
            routeLengthM += length
        }

        val calibrationError = validateCalibration(route.calibration, routeLengthM)
        if (calibrationError != null) return fail(calibrationError)
        val calibrationLengthM = route.calibration.last().measureToM
        val measureScale = calibrationLengthM / routeLengthM
        val cosLatitude = cos(radians(latitude))

        fun project(point: Point): Pair<Double, Double> {
            val x = EARTH_RADIUS_M * radians(point.longitude - longitude) * cosLatitude
            val y = EARTH_RADIUS_M * radians(point.latitude - latitude)
            return x to y
        }

        val candidates = ArrayList<Candidate>(route.points.size - 1)
        var cumulativeM = 0.0
        for (index in 0 until route.points.lastIndex) {
            val a = project(route.points[index])
            val b = project(route.points[index + 1])
            val dx = b.first - a.first
            val dy = b.second - a.second
            val denominator = dx * dx + dy * dy
            val t = if (denominator > 0.0) {
                (- (a.first * dx + a.second * dy) / denominator).coerceIn(0.0, 1.0)
            } else 0.0
            val nearestX = a.first + t * dx
            val nearestY = a.second + t * dy
            val distanceM = hypot(nearestX, nearestY)
            val rawMeasureM = cumulativeM + t * segmentLengths[index]
            val calibratedMeasureM = rawMeasureM * measureScale
            val chainage = interpolateChainage(calibratedMeasureM, route.calibration)
                ?: return fail("chainage_calibration_unmapped")
            candidates += Candidate(distanceM, calibratedMeasureM, chainage, index)
            cumulativeM += segmentLengths[index]
        }

        val sorted = candidates.sortedBy { it.distanceM }
        val best = sorted.firstOrNull() ?: return fail("route_geometry_invalid")
        val second = sorted.getOrNull(1)
        if (best.distanceM > maxTrackOffsetM) return fail("gps_off_candidate_route")
        if (best.chainageKm > route.alertRouteEndChainageKm + 0.05) return fail("outside_alert_route_corridor")
        if (second != null
            && second.distanceM - best.distanceM <= ambiguityDistanceDeltaM
            && abs(second.chainageKm - best.chainageKm) > ambiguityChainageDeltaKm) {
            return fail("ambiguous_track_match")
        }

        return TrackMapMatchResult(
            matched = true,
            reason = "gps_matched_to_route",
            routeId = routeId,
            chainageKm = round(best.chainageKm * 1000.0) / 1000.0,
            crossTrackDistanceM = round(best.distanceM * 10.0) / 10.0,
            gpsAccuracyM = round(accuracyM * 10.0) / 10.0,
            gpsFixAtMs = gpsFixAtMs,
            segmentIndex = best.segmentIndex,
            candidateStatus = route.candidateStatus
        )
    }

    private fun loadRoute(): RouteData {
        val root = JSONObject(assetJsonLoader())
        val encoded = String(Base64.getDecoder().decode(root.getString("encodedPolylineBase64")), Charsets.UTF_8)
        val precision = root.optInt("precision", 6)
        val points = decodePolyline(encoded, precision)
        val rows = root.getJSONArray("chainageCalibration")
        val calibration = (0 until rows.length()).map { index ->
            val row = rows.getJSONObject(index)
            Calibration(
                row.getDouble("measureFromM"),
                row.getDouble("measureToM"),
                row.getDouble("chainageFromKm"),
                row.getDouble("chainageToKm")
            )
        }
        val alertRouteEndChainageKm = root.optDouble("alertRouteEndChainageKm", Double.NaN)
        if (!alertRouteEndChainageKm.isFinite() || alertRouteEndChainageKm <= 0.0
            || alertRouteEndChainageKm > calibration.last().chainageToKm) {
            throw IllegalArgumentException("Invalid alert route chainage limit")
        }
        return RouteData(
            root.getString("route"),
            root.optString("candidateStatus", "UNKNOWN"),
            points,
            calibration,
            alertRouteEndChainageKm
        )
    }

    private fun decodePolyline(encoded: String, precision: Int): List<Point> {
        var index = 0
        var latitude = 0
        var longitude = 0
        val factor = 10.0.pow(precision)
        val points = ArrayList<Point>()

        fun decodeValue(): Int {
            var result = 0
            var shift = 0
            var byte: Int
            do {
                if (index >= encoded.length) throw IllegalArgumentException("Truncated route polyline")
                byte = encoded[index++].code - 63
                if (byte !in 0..63) throw IllegalArgumentException("Invalid route polyline character")
                result = result or ((byte and 0x1f) shl shift)
                shift += 5
            } while (byte >= 0x20)
            return if ((result and 1) != 0) (result shr 1).inv() else (result shr 1)
        }

        while (index < encoded.length) {
            latitude += decodeValue()
            longitude += decodeValue()
            points += Point(longitude / factor, latitude / factor)
        }
        if (points.size < 2) throw IllegalArgumentException("Route polyline has insufficient coordinates")
        return points
    }

    private fun validateCalibration(rows: List<Calibration>, routeLengthM: Double): String? {
        if (rows.isEmpty()) return "chainage_calibration_missing"
        var previousMeasure = 0.0
        var previousChainage: Double? = null
        rows.forEachIndexed { index, row ->
            val values = listOf(row.measureFromM, row.measureToM, row.chainageFromKm, row.chainageToKm)
            if (values.any { !it.isFinite() }) return "chainage_calibration_invalid"
            if (row.measureToM <= row.measureFromM || row.chainageToKm <= row.chainageFromKm) return "chainage_calibration_invalid"
            if (index == 0 && abs(row.measureFromM) > 1.0) return "chainage_calibration_start_gap"
            if (index > 0 && abs(row.measureFromM - previousMeasure) > 1.0) return "chainage_calibration_measure_gap"
            if (index > 0 && abs(row.chainageFromKm - (previousChainage ?: 0.0)) > 0.001) return "chainage_calibration_km_gap"
            previousMeasure = row.measureToM
            previousChainage = row.chainageToKm
        }
        if (abs(previousMeasure - routeLengthM) > max(100.0, routeLengthM * 0.002)) {
            return "chainage_calibration_length_mismatch"
        }
        return null
    }

    private fun interpolateChainage(measureM: Double, rows: List<Calibration>): Double? {
        val row = rows.firstOrNull {
            measureM >= it.measureFromM - 1.0 && measureM <= it.measureToM + 1.0
        } ?: return null
        val fraction = ((measureM - row.measureFromM) / (row.measureToM - row.measureFromM)).coerceIn(0.0, 1.0)
        return row.chainageFromKm + fraction * (row.chainageToKm - row.chainageFromKm)
    }

    private fun haversineMeters(a: Point, b: Point): Double {
        val dLat = radians(b.latitude - a.latitude)
        val dLon = radians(b.longitude - a.longitude)
        val lat1 = radians(a.latitude)
        val lat2 = radians(b.latitude)
        val h = sin(dLat / 2).pow(2) + cos(lat1) * cos(lat2) * sin(dLon / 2).pow(2)
        return 2 * EARTH_RADIUS_M * asin(sqrt(min(1.0, h)))
    }

    private fun radians(value: Double) = value * PI / 180.0

    companion object {
        const val EXPECTED_ROUTE_ID = "LGH-PLC"
        const val ASSET_NAME = "route-lgh-plc-candidate.json"
        private const val EARTH_RADIUS_M = 6371008.8
    }
}
