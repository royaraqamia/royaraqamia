package com.royaraqamia.app.shell

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue

/**
 * The escape hatch (#661): the surfaces the remote switch sends to the system
 * browser instead of drawing them natively.
 *
 * A native screen that must change before the next APK is a screen that pins the
 * release train. The switch is the way out: an operator names one surface in
 * `/android/config.json` ([ShellConfig]), and every route that surface serves
 * opens in a Custom Tab against the live site until the name is removed. It is
 * off by default — the empty set is the app as shipped — and turning it off is
 * the same edit in reverse, with no release and no update prompt.
 *
 * The decision is one question, [opensInBrowser], asked by the shell before it
 * draws a route, so there is no second table of which screens are "really" the
 * browser. A surface id comes from the generated `Screens` registry, the same
 * one the assistant's eyes read (ADR-0181), so a name that is not a surface is
 * a name that matches nothing rather than a silent rule about a path.
 */
object BrowserEscape {
    /** The names the last config read answered; empty means every surface is native. */
    private var switched: Set<String> by mutableStateOf(emptySet())

    /**
     * Records what the latest config read named, and answers whether that
     * changed the switch.
     *
     * The changed flag is what lets the caller act once: the shell re-reads the
     * document on every return to the front, and a result that did not move must
     * not re-open the same Custom Tab under a member who just closed it.
     */
    fun publish(surfaces: Set<String>): Boolean {
        val next =
            surfaces
                .map { it.trim() }
                .filter { it.isNotEmpty() }
                // A route is spelled the way the shell reads it, so `/rates/` in a
                // hand-edited document is the same switch as `/rates`.
                .map { if (it.startsWith("/")) Routes.normalize(it) else it }
                .toSet()
        if (next == switched) return false
        switched = next
        return true
    }

    /** Puts every surface back on its native screen. */
    fun clear(): Boolean = publish(emptySet())

    /**
     * Whether [route] is one of the switched surfaces.
     *
     * A name may be a surface id (`community`) or a route (`/community/explore`).
     * A surface id covers everything `Screens.resolve` places on that surface —
     * including the dynamic rows a single route string could not — while an exact
     * route is the narrower switch for one page of a surface.
     */
    fun opensInBrowser(route: String): Boolean {
        if (switched.isEmpty()) return false

        val path = Routes.normalize(route)
        if (path in switched) return true

        val surface = Screens.resolve(path)?.screenId ?: return false
        return surface in switched
    }
}
