package `in`.railwaymitra

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
import android.os.Build
import android.os.Bundle
import android.os.IBinder
import androidx.core.app.NotificationCompat

class LocationMonitorService : Service(), LocationListener {
    private lateinit var locationManager: LocationManager
    private val channelId = "rm_location_monitor"
    private var monitoring = false

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

        return try {
            // Android 14+ validates the location FGS permission at startForeground().
            startForeground(7102, notification("Starting GPS location monitoring"))
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
        getSharedPreferences("rm_location", MODE_PRIVATE).edit()
            .putString("lat", location.latitude.toString())
            .putString("lon", location.longitude.toString())
            .putFloat("accuracy", location.accuracy)
            .putLong("timestamp", location.time)
            .apply()
        updateNotification("GPS updated · accuracy ±" + location.accuracy.toInt() + " m")
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
            .setContentTitle("Railway Mitra · Location ON")
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
        stopMonitoring()
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null

    companion object {
        const val ACTION_START = "in.railwaymitra.START_LOCATION"
        const val ACTION_STOP = "in.railwaymitra.STOP_LOCATION"
    }
}
