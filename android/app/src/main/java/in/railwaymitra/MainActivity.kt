package `in`.railwaymitra

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.webkit.JavascriptInterface
import android.webkit.WebChromeClient
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.ComponentActivity
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat

class MainActivity : ComponentActivity() {
    private lateinit var web: WebView
    private val permissions = mutableListOf(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION).apply {
        if (Build.VERSION.SDK_INT >= 33) add(Manifest.permission.POST_NOTIFICATIONS)
    }.toTypedArray()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        web = WebView(this).apply {
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
            webViewClient = WebViewClient()
            webChromeClient = WebChromeClient()
            addJavascriptInterface(LocationBridge(), "RailwayMitraNative")
        }
        setContentView(web)
        if (permissions.any { ContextCompat.checkSelfPermission(this, it) != PackageManager.PERMISSION_GRANTED }) {
            ActivityCompat.requestPermissions(this, permissions, 4101)
        }
        web.loadUrl("https://sharerohit111-pixel.github.io/railway-mitra/")
    }

    inner class LocationBridge {
        @JavascriptInterface fun startLocationMonitoring(): String {
            val fine = ContextCompat.checkSelfPermission(this@MainActivity, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED
            if (!fine) return "permission_required"
            ContextCompat.startForegroundService(this@MainActivity, Intent(this@MainActivity, LocationMonitorService::class.java).setAction(LocationMonitorService.ACTION_START))
            return "started"
        }
        @JavascriptInterface fun stopLocationMonitoring(): String {
            startService(Intent(this@MainActivity, LocationMonitorService::class.java).setAction(LocationMonitorService.ACTION_STOP))
            return "stopped"
        }
        @JavascriptInterface fun getLastLocation(): String {
            val p = getSharedPreferences("rm_location", MODE_PRIVATE)
            val lat = p.getString("lat", null) ?: return ""
            val lon = p.getString("lon", null) ?: return ""
            return "{\"latitude\":$lat,\"longitude\":$lon,\"accuracy\":${p.getFloat("accuracy", -1f)},\"timestamp\":${p.getLong("timestamp", 0)}}"
        }
    }

    override fun onDestroy() {
        web.destroy()
        super.onDestroy()
    }
}
