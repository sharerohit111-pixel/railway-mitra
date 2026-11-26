package `in`.railwaymitra

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.Manifest
import android.content.pm.PackageManager
import android.content.Context
import android.content.Intent
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
import android.os.Build
import android.os.Bundle
import android.os.IBinder
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import java.util.concurrent.Executors
import java.util.concurrent.ScheduledExecutorService
import java.util.concurrent.TimeUnit
import java.util.Locale

class LocationMonitorService : Service(), LocationListener {
    private lateinit var locationManager: LocationManager
    private val channelId = "rm_location_monitor"
    private var monitoring = false
    private var reportPollExecutor: ScheduledExecutorService? = null
    @Volatile private var previousReportFeed: TrainReportFeed? = null
    private val trackMapMatcher by lazy { TrackMapMatcher(this) }

    override fun onCreate() {
        super.onCreate()
        createChannel()
        locationManager = getSystemService(Context.LOCATION_SERVICE) as LocationManager
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == ACTION_STOP) {
            stopMonitoring()
            stopForeground(STOP_FOREGROUND_REMOVE)
            stopSelf()
            return START_NOT_STICKY
        }

        if (Build.VERSION.SDK_INT >= 29 && ContextCompat.checkSelfPermission(
                this, Manifest.permission.ACCESS_BACKGROUND_LOCATION
            ) != PackageManager.PERMISSION_GRANTED
        ) {
            stopSelf()
            return START_NOT_STICKY
        }

        return try {
            // Android 14+ validates the location FGS permission at startForeground().
            startForeground(7102, notification("GPS capture active · data stays on this phone · 5 KM alert disabled"))
            if (!locationManager.isProviderEnabled(LocationManager.GPS_PROVIDER)) {
                updateNotification("Turn on device location to continue")
                return START_STICKY
            }
            locationManager.requestLocationUpdates(
                LocationManager.GPS_PROVIDER,
                5000L,
                10f,
                this
            )
            monitoring = true
            locationManager.getLastKnownLocation(LocationManager.GPS_PROVIDER)?.let { onLocationChanged(it) }
            startReportPollingIfArmed()
            START_STICKY
        } catch (_: SecurityException) {
            stopMonitoring()
            stopForeground(STOP_FOREGROUND_REMOVE)
            stopSelf()
            START_NOT_STICKY
        } catch (_: IllegalArgumentException) {
            updateNotification("GPS provider is unavailable on this device")
            START_NOT_STICKY
        }
    }

    /**
     * Poll only after a future, fully verified alert flow explicitly arms the service.
     * The current UI never sets alert_armed; GPS capture alone must not poll or alarm.
     */
    private fun startReportPollingIfArmed() {
        val alertPrefs = getSharedPreferences("rm_train_gps", MODE_PRIVATE)
        if (!alertPrefs.getBoolean("alert_armed", false) || reportPollExecutor != null) return
        reportPollExecutor = Executors.newSingleThreadScheduledExecutor()
        reportPollExecutor?.scheduleWithFixedDelay({
            try {
                val feed = TrainReportPollingClient().fetchEligibleReports()
                val locationPrefs = getSharedPreferences("rm_location", MODE_PRIVATE)
                val candidateKm = locationPrefs.getFloat("candidateTrackKm", Float.NaN)
                val gpsAccuracy = locationPrefs.getFloat("accuracy", -1f)
                val gpsFixAt = locationPrefs.getLong("timestamp", 0L)
                val evaluation = FiveKmAlertEvaluator.evaluate(
                    previousFeed = previousReportFeed,
                    currentFeed = feed,
                    userTrackKm = candidateKm.takeIf { it.isFinite() }?.toDouble(),
                    gpsAccuracyM = gpsAccuracy.toDouble(),
                    gpsFixAtMs = gpsFixAt,
                    nowMs = System.currentTimeMillis(),
                    armed = true,
                    // These remain hard-disabled until official route identity and backend rollout are approved.
                    routeGeometryProductionVerified = false,
                    reportFeedProductionApproved = false,
                    // UP/DOWN operational chainage orientation has not been field-verified.
                    directionSignFor = { null }
                )
                alertPrefs.edit()
                    .putString("latest_public_train_reports", feed.toJson())
                    .putLong("train_reports_server_time", feed.serverTimeMs)
                    .putString("last_approach_evaluation", evaluation.reason)
                    .putLong("last_approach_evaluation_at", System.currentTimeMillis())
                    .apply()
                previousReportFeed = feed
            } catch (error: Exception) {
                Log.w("LocationMonitorService", "Train report poll failed; no alert may be inferred", error)
            }
        }, 0, 30, TimeUnit.SECONDS)
    }

    private fun stopMonitoring() {
        if (::locationManager.isInitialized && monitoring) {
            try {
                locationManager.removeUpdates(this)
            } catch (_: SecurityException) {
                // Permission may have been revoked while the service was active.
            }
        }
        monitoring = false
    }

    override fun onLocationChanged(location: Location) {
        val match = try {
            trackMapMatcher.matchGpsToRoute(
                latitude = location.latitude,
                longitude = location.longitude,
                accuracyM = location.accuracy.toDouble(),
                gpsFixAtMs = location.time,
                nowMs = System.currentTimeMillis()
            )
        } catch (error: Exception) {
            Log.w("LocationMonitorService", "Candidate route map matching failed closed", error)
            null
        }

        val locationPrefs = getSharedPreferences("rm_location", MODE_PRIVATE)
        val editor = locationPrefs.edit()
            .putString("lat", location.latitude.toString())
            .putString("lon", location.longitude.toString())
            .putFloat("accuracy", location.accuracy)
            .putLong("timestamp", location.time)
            .putString("candidateTrackMatchReason", match?.reason ?: "route_match_error")
            .putString("candidateRouteStatus", match?.candidateStatus ?: "NOT_PRODUCTION_VERIFIED")
        if (match != null && match.matched && match.chainageKm != null) {
            editor.putFloat("candidateTrackKm", match.chainageKm.toFloat())
                .putFloat("candidateTrackOffsetM", (match.crossTrackDistanceM ?: 0.0).toFloat())
        } else {
            editor.remove("candidateTrackKm")
                .remove("candidateTrackOffsetM")
        }
        editor.apply()

        val matchMessage = if (match != null && match.matched && match.chainageKm != null) {
            " · candidate KM " + String.format(Locale.US, "%.3f", match.chainageKm)
        } else {
            " · no candidate track match"
        }
        updateNotification("GPS saved locally · accuracy ±" + location.accuracy.toInt() + " m" + matchMessage + " · 5 KM alert disabled")
    }

    private fun createChannel() {
        if (Build.VERSION.SDK_INT >= 26) {
            val channel = NotificationChannel(
                channelId,
                "Railway Mitra GPS",
                NotificationManager.IMPORTANCE_LOW
            )
            (getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager)
                .createNotificationChannel(channel)
        }
    }

    private fun updateNotification(message: String) {
        val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        nm.notify(7102, notification(message))
    }

    private fun notification(message: String): Notification =
        NotificationCompat.Builder(this, channelId)
            .setSmallIcon(android.R.drawable.ic_menu_mylocation)
            .setContentTitle("Railway Mitra · GPS capture")
            .setContentText(message)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .build()

    override fun onProviderEnabled(provider: String) {}
    override fun onProviderDisabled(provider: String) {
        if (provider == LocationManager.GPS_PROVIDER) {
            updateNotification("Device location is off")
        }
    }

    @Deprecated("Deprecated in Android API")
    override fun onStatusChanged(provider: String?, status: Int, extras: Bundle?) {}

    override fun onDestroy() {
        reportPollExecutor?.shutdownNow()
        reportPollExecutor = null
        stopMonitoring()
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null

    companion object {
        const val ACTION_START = "in.railwaymitra.START_LOCATION"
        const val ACTION_STOP = "in.railwaymitra.STOP_LOCATION"
    }
}
