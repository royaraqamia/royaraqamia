package com.royaraqamia.app.net

import android.content.Context
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import java.io.Closeable

/**
 * Whether a request can reach the server, and a way to hear when it can again
 * (#650).
 *
 * The Outbox's drain has to answer two questions the rest of the app does not:
 * "is there a radio at all?" before it tries, and "has the radio come back?"
 * while the app is open. `ConnectivityManager` is the platform's own answer to
 * both, so a FAILED request is not how the drain discovers it is offline — the
 * queue would then have to spend an attempt learning what the system already
 * knows, and the pill would say "failed sync" about work that has not been tried.
 *
 * `NET_CAPABILITY_INTERNET` rather than `VALIDATED`: a phone that just rejoined
 * Wi-Fi has an internet-capable network a moment before Android finishes
 * validating it, and a drain that waits for validation is a write that waits for
 * a captive-portal check it does not need. The attempt itself is the check.
 */
object Connectivity {
    fun isOnline(context: Context): Boolean {
        val manager = context.getSystemService(Context.CONNECTIVITY_SERVICE) as? ConnectivityManager
            ?: return true
        val network = manager.activeNetwork ?: return false
        val capabilities = manager.getNetworkCapabilities(network) ?: return false
        return capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
    }

    /**
     * Calls [onAvailable] whenever a network becomes available, which is the
     * trigger "a queued write drains when the radio returns". The returned
     * handle unregisters it; a platform that refuses the registration (a device
     * with no permission, an OEM that replaced the service) yields a no-op rather
     * than an exception on the launch path.
     */
    fun watch(context: Context, onAvailable: () -> Unit): Closeable {
        val manager = context.getSystemService(Context.CONNECTIVITY_SERVICE) as? ConnectivityManager
            ?: return Closeable {}
        val callback =
            object : ConnectivityManager.NetworkCallback() {
                override fun onAvailable(network: Network) = onAvailable()
            }
        return try {
            manager.registerDefaultNetworkCallback(callback)
            Closeable { runCatching { manager.unregisterNetworkCallback(callback) } }
        } catch (_: RuntimeException) {
            Closeable {}
        }
    }
}
