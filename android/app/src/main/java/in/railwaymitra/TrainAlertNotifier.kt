package `in`.railwaymitra

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.media.Ringtone
import android.media.RingtoneManager
import android.os.Build
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat

/**
 * Alarm delivery primitive for the foreground location service.
 * It is deliberately not invoked until the route and report-feed approvals pass.
 */
class TrainAlertNotifier(private val context: Context) {
    private var ringtone: Ringtone? = null

    fun start(trainNumber: String, distanceKm: Double): Boolean {
        if (Build.VERSION.SDK_INT >= 33 && ContextCompat.checkSelfPermission(
                context, Manifest.permission.POST_NOTIFICATIONS
            ) != PackageManager.PERMISSION_GRANTED
        ) return false
        if (trainNumber.isBlank() || !distanceKm.isFinite() || distanceKm !in 0.0..5.0) return false

        ensureChannel()
        val openIntent = Intent(context, MainActivity::class.java)
        val openPendingIntent = PendingIntent.getActivity(
            context, NOTIFICATION_ID, openIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        val stopIntent = Intent(context, LocationMonitorService::class.java).apply {
            action = LocationMonitorService.ACTION_STOP_TRAIN_ALERT
        }
        val stopPendingIntent = PendingIntent.getService(
            context, NOTIFICATION_ID + 1, stopIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val notification = NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_dialog_alert)
            .setContentTitle("Train approaching within 5 km")
            .setContentText("Train $trainNumber · %.2f km away".format(java.util.Locale.US, distanceKm))
            .setCategory(NotificationCompat.CATEGORY_ALARM)
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setOngoing(true)
            .setAutoCancel(false)
            .setOnlyAlertOnce(true)
            .setContentIntent(openPendingIntent)
            .addAction(android.R.drawable.ic_media_pause, "Stop alarm", stopPendingIntent)
            .build()

        NotificationManagerCompat.from(context).notify(NOTIFICATION_ID, notification)
        startSoundAndVibration()
        return true
    }

    fun stop() {
        ringtone?.stop()
        ringtone = null
        vibrator()?.cancel()
        NotificationManagerCompat.from(context).cancel(NOTIFICATION_ID)
    }

    private fun ensureChannel() {
        if (Build.VERSION.SDK_INT < 26) return
        val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        if (manager.getNotificationChannel(CHANNEL_ID) != null) return
        val channel = NotificationChannel(
            CHANNEL_ID,
            "Train proximity alarms",
            NotificationManager.IMPORTANCE_HIGH
        ).apply {
            description = "Audible and vibrating alert when a verified train approaches within five kilometres"
            enableVibration(true)
            vibrationPattern = VIBRATION_PATTERN
            setSound(null, null) // The service plays the looping alarm tone itself.
            lockscreenVisibility = android.app.Notification.VISIBILITY_PUBLIC
        }
        manager.createNotificationChannel(channel)
    }

    private fun startSoundAndVibration() {
        val alarmUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM)
            ?: RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION)
        if (alarmUri != null) {
            ringtone?.stop()
            ringtone = RingtoneManager.getRingtone(context, alarmUri)?.also { tone ->
                if (Build.VERSION.SDK_INT >= 28) tone.isLooping = true
                tone.play()
            }
        }
        val deviceVibrator = vibrator() ?: return
        if (Build.VERSION.SDK_INT >= 26) {
            deviceVibrator.vibrate(VibrationEffect.createWaveform(VIBRATION_PATTERN, 0))
        } else {
            @Suppress("DEPRECATION")
            deviceVibrator.vibrate(VIBRATION_PATTERN, 0)
        }
    }

    private fun vibrator(): Vibrator? {
        return if (Build.VERSION.SDK_INT >= 31) {
            (context.getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as? VibratorManager)?.defaultVibrator
        } else {
            @Suppress("DEPRECATION")
            context.getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator
        }
    }

    companion object {
        const val CHANNEL_ID = "railway_mitra_train_proximity_alarm"
        const val NOTIFICATION_ID = 7110
        val VIBRATION_PATTERN = longArrayOf(0, 700, 300, 700, 300, 1000)
    }
}
