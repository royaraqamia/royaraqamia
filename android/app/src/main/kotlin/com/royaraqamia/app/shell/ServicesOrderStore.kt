package com.royaraqamia.app.shell

import android.content.Context
import com.royaraqamia.app.session.SharedPreferencesStorage

/**
 * Where the services sheet's order lives (#806).
 *
 * An interface so the rules in [ServicesOrderRules] are a unit test and the
 * platform is one small adapter: what a device remembers, and when it writes
 * it, are the only things this seam decides.
 */
interface ServicesOrderStore {
    /** The routes this device remembers, or `null` when it remembers none. */
    fun read(): List<String>?

    fun save(routes: List<String>)
}

/**
 * The device's own preferences file: per device, no account copy and no server
 * route (the site keeps the same order in `localStorage`).
 *
 * A file of its own rather than the session's or the identity's, so that
 * clearing one is not clearing the others.
 */
class PreferencesServicesOrderStore(
    context: Context,
    file: String = PREFERENCES_FILE,
) : ServicesOrderStore {
    private val storage = SharedPreferencesStorage(context, file)

    override fun read(): List<String>? = ServicesOrderRules.parse(storage.read(ServicesOrderRules.KEY))

    override fun save(routes: List<String>) {
        storage.write(ServicesOrderRules.KEY, ServicesOrderRules.encode(routes))
    }

    companion object {
        const val PREFERENCES_FILE = "rr-shell"
    }
}
