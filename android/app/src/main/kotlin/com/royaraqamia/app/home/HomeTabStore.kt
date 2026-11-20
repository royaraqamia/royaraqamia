package com.royaraqamia.app.home

import android.content.Context

/**
 * The app the door was last showing (#1399, ADR-0151).
 *
 * The web keeps this in `localStorage` under `royaraqamia:home-tab:v1` and reads
 * it only for a plain `/`; the address (`/?tab=/<app>`) is the stronger
 * statement. The app has no address bar, so the same preference is what a cold
 * launch onto `/` paints, and a deep link's `?tab=` wins over it exactly as it
 * does on the page.
 *
 * A stored value the catalog no longer has is dropped on read rather than drawn
 * as a tab that cannot open, which is the strip's own rule for its rows.
 */
interface HomeTabStore {
    fun read(): String?

    fun write(route: String)
}

class PreferencesHomeTabStore(context: Context) : HomeTabStore {
    private val preferences =
        context.getSharedPreferences(PREFERENCES_FILE, Context.MODE_PRIVATE)

    override fun read(): String? = preferences.getString(KEY, null)

    override fun write(route: String) {
        preferences.edit().putString(KEY, route).commit()
    }

    companion object {
        const val PREFERENCES_FILE = "rr-home-tab"

        /** The key the web uses in `localStorage`, so a reader finds the same name. */
        const val KEY = "royaraqamia:home-tab:v1"
    }
}

/**
 * Which app the door draws under its strip (#1399, ADR-0151, ADR-0156).
 *
 * The address wins: `/?tab=/<app>` is how a bookmark, a shared link and a
 * retired app route name the tab they want. Otherwise the device's remembered
 * tab, when the strip still holds it, and finally the first app the member kept.
 * A tab the strip does not hold but the address names is still drawn, without a
 * pill, so a guest following a LinkSnap link lands on the shortener rather than
 * on the first-run card.
 */
object HomeDoor {
    fun selected(requested: String?, remembered: String?, order: List<String>): String? {
        if (requested != null) return requested
        if (remembered != null && remembered in order) return remembered
        return order.firstOrNull()
    }
}
