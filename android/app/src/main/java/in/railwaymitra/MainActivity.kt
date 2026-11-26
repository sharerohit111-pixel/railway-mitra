package `in`.railwaymitra

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import org.json.JSONObject
import android.webkit.SslErrorHandler
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import android.webkit.WebChromeClient
import android.webkit.JavascriptInterface
import android.net.http.SslError
import androidx.activity.ComponentActivity
import androidx.lifecycle.lifecycleScope
import androidx.credentials.CredentialManager
import androidx.credentials.GetCredentialRequest
import androidx.credentials.NoCredentialException
import androidx.credentials.CustomCredential
import com.google.android.libraries.identity.googleid.GetGoogleIdOption
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.auth.GoogleAuthProvider
import kotlinx.coroutines.launch
import kotlinx.coroutines.tasks.await
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat

class MainActivity : ComponentActivity() {
    private lateinit var web: WebView
    // The published site canonicalizes to the custom domain. Keep the GitHub Pages
    // project URL as a secondary trusted origin for redirects and preview builds.
    private val allowedHosts = setOf("railwaymitra.com", "www.railwaymitra.com", "sharerohit111-pixel.github.io")
    private val githubPagesPath = "/railway-mitra/"
    private val permissionRequestCode = 4101
    private val backgroundPermissionRequestCode = 4102
    private val credentialManager by lazy { CredentialManager.create(this) }
    private val firebaseAuth by lazy { FirebaseAuth.getInstance() }
    @Volatile private var googleSignInInProgress = false

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
                    val trusted = uri.scheme == "https" && when (uri.host) {
                        "railwaymitra.com", "www.railwaymitra.com" -> true
                        "sharerohit111-pixel.github.io" -> uri.path?.startsWith(githubPagesPath) == true
                        else -> false
                    }
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
        web.loadUrl("https://railwaymitra.com/")
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
        runOnUiThread {
            try {
                val intent = Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
                    data = Uri.parse("package:$packageName")
                }
                startActivity(intent)
            } catch (_: Exception) {
                // The WebView status message remains visible if Android cannot open Settings.
            }
        }
        return "settings_opened"
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
        fun startGoogleSignIn(): String {
            if (!isTrustedWebOrigin()) return "untrusted_origin"
            if (googleSignInInProgress) return "in_progress"
            googleSignInInProgress = true
            runOnUiThread {
                lifecycleScope.launch {
                    try {
                        val token = requestGoogleIdToken()
                        val credential = GoogleAuthProvider.getCredential(token, null)
                        firebaseAuth.signInWithCredential(credential).await()
                        deliverGoogleSignInResult(token, null)
                    } catch (error: Exception) {
                        val message = when (error) {
                            is androidx.credentials.GetCredentialCancellationException -> "cancelled"
                            is NoCredentialException -> "no_account"
                            else -> "google_sign_in_failed"
                        }
                        deliverGoogleSignInResult(null, message)
                    } finally {
                        googleSignInInProgress = false
                    }
                }
            }
            return "started"
        }

        private suspend fun requestGoogleIdToken(): String {
            suspend fun request(filterAuthorized: Boolean): String {
                val option = GetGoogleIdOption.Builder()
                    .setServerClientId(getString(R.string.default_web_client_id))
                    .setFilterByAuthorizedAccounts(filterAuthorized)
                    .setAutoSelectEnabled(false)
                    .build()
                val request = GetCredentialRequest.Builder()
                    .addCredentialOption(option)
                    .build()
                val result = credentialManager.getCredential(this@MainActivity, request)
                val credential = result.credential
                if (credential is CustomCredential &&
                    credential.type == GoogleIdTokenCredential.TYPE_GOOGLE_ID_TOKEN_CREDENTIAL
                ) {
                    return GoogleIdTokenCredential.createFrom(credential.data).idToken
                }
                throw IllegalStateException("unsupported_credential")
            }

            return try {
                request(true)
            } catch (_: NoCredentialException) {
                request(false)
            }
        }

        private fun isTrustedWebOrigin(): Boolean {
            val uri = web.url?.let { Uri.parse(it) } ?: return false
            return uri.scheme == "https" && when (uri.host) {
                "railwaymitra.com", "www.railwaymitra.com" -> true
                "sharerohit111-pixel.github.io" -> uri.path?.startsWith(githubPagesPath) == true
                else -> false
            }
        }

        private fun deliverGoogleSignInResult(idToken: String?, error: String?) {
            val payload = JSONObject()
                .put("idToken", idToken ?: JSONObject.NULL)
                .put("error", error ?: JSONObject.NULL)
            val script = "window.onRailwayMitraGoogleSignInResult && window.onRailwayMitraGoogleSignInResult(" + payload.toString() + ");"
            web.post { web.evaluateJavascript(script, null) }
        }

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
                    runOnUiThread {
                        ActivityCompat.requestPermissions(
                            this@MainActivity,
                            arrayOf(Manifest.permission.ACCESS_BACKGROUND_LOCATION),
                            backgroundPermissionRequestCode
                        )
                    }
                    "permission_requested"
                }
            } catch (_: Exception) {
                "settings_failed"
            }
        }

        @JavascriptInterface
        fun openAppSettings(): String {
            return this@MainActivity.openAppSettings()
        }

        @JavascriptInterface
        fun openNotificationSettings(): String {
            return this@MainActivity.openAppSettings()
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
            val latitude = lat.toDoubleOrNull() ?: return ""
            val longitude = lon.toDoubleOrNull() ?: return ""
            val accuracy = p.getFloat("accuracy", -1f)
            val timestamp = p.getLong("timestamp", 0L)
            val candidateTrackKm = p.getFloat("candidateTrackKm", Float.NaN)
            val candidateTrackMatchReason = p.getString("candidateTrackMatchReason", "not_available") ?: "not_available"
            val candidateRouteStatus = p.getString("candidateRouteStatus", "NOT_PRODUCTION_VERIFIED") ?: "NOT_PRODUCTION_VERIFIED"
            val result = JSONObject()
                .put("latitude", latitude)
                .put("longitude", longitude)
                .put("accuracy", accuracy)
                .put("timestamp", timestamp)
                .put("candidateTrackMatchReason", candidateTrackMatchReason)
                .put("candidateRouteStatus", candidateRouteStatus)
            if (candidateTrackKm.isFinite()) result.put("candidateTrackKm", candidateTrackKm.toDouble())
            else result.put("candidateTrackKm", JSONObject.NULL)
            return result.toString()
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
