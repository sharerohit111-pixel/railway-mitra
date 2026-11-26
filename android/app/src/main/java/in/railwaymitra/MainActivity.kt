package `in`.railwaymitra

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.webkit.SslErrorHandler
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import android.webkit.WebChromeClient
import android.webkit.JavascriptInterface
import android.net.http.SslError
import androidx.activity.ComponentActivity
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat

class MainActivity : ComponentActivity() {
    private lateinit var web: WebView
    private val allowedHost = "sharerohit111-pixel.github.io"
    private val allowedPath = "/railway-mitra/"
    private val permissionRequestCode = 4101
    private val backgroundPermissionRequestCode = 4102

    private val requestedPermissions: Array<String>
        get() = mutableListOf(
            Manifest.permission.ACCESS_FINE_LOCATION,
            Manifest.permission.ACCESS_COARSE_LOCATION
        ).apply {
            if (Build.VERSION.SDK_INT >= 33) add(Manifest.permission.POST_NOTIFICATIONS)
        }.toTypedArray()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        web = WebView(this).apply {
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
            settings.allowFileAccess = false
            settings.allowContentAccess = false
            settings.javaScriptCanOpenWindowsAutomatically = false
            webViewClient = object : WebViewClient() {
                override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                    val uri = request.url
                    val trusted = uri.scheme == "https" &&
                        uri.host == allowedHost &&
                        uri.path?.startsWith(allowedPath) == true
                    if (trusted) return false
                    if (request.isForMainFrame) {
                        // Keep navigation inside the trusted app origin; do not expose the native bridge elsewhere.
                        return true
                    }
                    return false
                }

                override fun onReceivedSslError(view: WebView, handler: SslErrorHandler, error: SslError) {
                    handler.cancel()
                }
            }
            webChromeClient = WebChromeClient()
            addJavascriptInterface(LocationBridge(), "RailwayMitraNative")
        }
        setContentView(web)
        requestMissingPermissions()
        web.loadUrl("https://$allowedHost$allowedPath")
    }

    private fun hasBackgroundLocationPermission(): Boolean {
        return Build.VERSION.SDK_INT < 29 || ContextCompat.checkSelfPermission(
            this, Manifest.permission.ACCESS_BACKGROUND_LOCATION
        ) == PackageManager.PERMISSION_GRANTED
    }

    private fun hasNotificationPermission(): Boolean {
        return Build.VERSION.SDK_INT < 33 || ContextCompat.checkSelfPermission(
            this, Manifest.permission.POST_NOTIFICATIONS
        ) == PackageManager.PERMISSION_GRANTED
    }

    private fun openAppSettings(): String {
        return try {
            val intent = Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
                data = Uri.parse("package:$packageName")
            }
            startActivity(intent)
            "settings_opened"
        } catch (_: Exception) {
            "settings_failed"
        }
    }

    private fun requestMissingPermissions() {
        val missing = requestedPermissions.filter {
            ContextCompat.checkSelfPermission(this, it) != PackageManager.PERMISSION_GRANTED
        }
        if (missing.isNotEmpty()) {
            ActivityCompat.requestPermissions(this, missing.toTypedArray(), permissionRequestCode)
        }
    }

    inner class LocationBridge {
        @JavascriptInterface
        fun getBackgroundLocationPermissionState(): String {
            return if (hasBackgroundLocationPermission()) "granted" else "required"
        }

        @JavascriptInterface
        fun getNotificationPermissionState(): String {
            return if (hasNotificationPermission()) "granted" else "required"
        }

        @JavascriptInterface
        fun requestBackgroundLocationPermission(): String {
            if (Build.VERSION.SDK_INT < 29 || hasBackgroundLocationPermission()) return "granted"
            return try {
                if (Build.VERSION.SDK_INT >= 30) {
                    openAppSettings()
                } else {
                    ActivityCompat.requestPermissions(
                        this@MainActivity,
                        arrayOf(Manifest.permission.ACCESS_BACKGROUND_LOCATION),
                        backgroundPermissionRequestCode
                    )
                    "permission_requested"
                }
            } catch (_: Exception) {
                "settings_failed"
            }
        }

        @JavascriptInterface
        fun openNotificationSettings(): String {
            return openAppSettings()
        }

        @JavascriptInterface
        fun startLocationMonitoring(): String {
            val fineGranted = ContextCompat.checkSelfPermission(
                this@MainActivity, Manifest.permission.ACCESS_FINE_LOCATION
            ) == PackageManager.PERMISSION_GRANTED
            if (!fineGranted) return "permission_required"
            if (!hasBackgroundLocationPermission()) return "background_permission_required"
            if (!hasNotificationPermission()) return "notification_permission_required"
            return try {
                ContextCompat.startForegroundService(
                    this@MainActivity,
                    Intent(this@MainActivity, LocationMonitorService::class.java)
                        .setAction(LocationMonitorService.ACTION_START)
                )
                "started"
            } catch (_: SecurityException) {
                "permission_required"
            } catch (_: IllegalStateException) {
                "start_not_allowed"
            }
        }

        @JavascriptInterface
        fun stopLocationMonitoring(): String {
            return try {
                startService(
                    Intent(this@MainActivity, LocationMonitorService::class.java)
                        .setAction(LocationMonitorService.ACTION_STOP)
                )
                "stopped"
            } catch (_: Exception) {
                "stop_failed"
            }
        }

        @JavascriptInterface
        fun getLastLocation(): String {
            val p = getSharedPreferences("rm_location", MODE_PRIVATE)
            val lat = p.getString("lat", null) ?: return ""
            val lon = p.getString("lon", null) ?: return ""
            val accuracy = p.getFloat("accuracy", -1f)
            val timestamp = p.getLong("timestamp", 0L)
            return "{\\\"latitude\\\":$lat,\\\"longitude\\\":$lon,\\\"accuracy\\\":$accuracy,\\\"timestamp\\\":$timestamp}"
        }

        @JavascriptInterface
        fun getLocationPermissionState(): String {
            val fine = ContextCompat.checkSelfPermission(
                this@MainActivity, Manifest.permission.ACCESS_FINE_LOCATION
            ) == PackageManager.PERMISSION_GRANTED
            val coarse = ContextCompat.checkSelfPermission(
                this@MainActivity, Manifest.permission.ACCESS_COARSE_LOCATION
            ) == PackageManager.PERMISSION_GRANTED
            return when {
                fine -> "precise"
                coarse -> "approximate"
                else -> "denied"
            }
        }
    }

    override fun onResume() {
        super.onResume()
        if (::web.isInitialized) {
            web.post {
                web.evaluateJavascript(
                    "window.onRailwayMitraNativeResume && window.onRailwayMitraNativeResume()",
                    null
                )
            }
        }
    }

    override fun onDestroy() {
        if (::web.isInitialized) {
            web.removeJavascriptInterface("RailwayMitraNative")
            web.stopLoading()
            web.loadUrl("about:blank")
            web.destroy()
        }
        super.onDestroy()
    }
}
