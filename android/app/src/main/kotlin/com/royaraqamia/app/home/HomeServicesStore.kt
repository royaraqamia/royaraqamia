package com.royaraqamia.app.home

import android.content.Context

/**
 * A guest's homepage apps, on this device (#1194, ADR-0146).
 *
 * The same shape the account stores — an ordered list of routes — so a sign-in
 * merges one into the other without a translation step. SharedPreferences rather
 * than a database: it is one preference, and `commit()` is what keeps a list the
 * user chose when the process is killed before the next frame.
 *
 * The file and key are the web's own names (`royaraqamia:home-services:v1`), so a
 * device dump reads the same on both clients, as the identity pointer does.
 */
interface HomeServicesStore {
    fun read(): List<String>

    /** True when the write reached the disk; false is a preference that cannot be saved. */
    fun write(routes: List<String>): Boolean

    fun clear()
}

class PreferencesHomeServicesStore(context: Context) : HomeServicesStore {
    private val preferences =
        context.getSharedPreferences(PREFERENCES_FILE, Context.MODE_PRIVATE)

    override fun read(): List<String> =
        preferences.getString(KEY, null)?.split(SEPARATOR)?.filter { it.isNotEmpty() }.orEmpty()

    override fun write(routes: List<String>): Boolean =
        preferences.edit().putString(KEY, routes.joinToString(SEPARATOR)).commit()

    override fun clear() {
        preferences.edit().remove(KEY).commit()
    }

    companion object {
        const val PREFERENCES_FILE = "rr-home-services"

        /** The key the web uses in `localStorage`, so a reader finds the same name. */
        const val KEY = "royaraqamia:home-services:v1"

        /**
         * Routes never contain a newline, so the separator cannot appear inside a
         * value; a JSON array would add a parser for a list of nine known strings.
         */
        private const val SEPARATOR = "\n"
    }
}
