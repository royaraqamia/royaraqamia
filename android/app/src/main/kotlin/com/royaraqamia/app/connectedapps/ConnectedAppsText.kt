package com.royaraqamia.app.connectedapps

import com.royaraqamia.app.plans.PlanDates
import com.royaraqamia.app.shared.TimeAgoParts
import com.royaraqamia.app.shared.timeAgoParts
import java.time.Instant

/**
 * The card's words, in the site's order (#657, ADR-0098).
 *
 * Every string is [ConnectedAppsCopy], generated from the same file the site's
 * module comes from; this object only decides which one a value goes into. The
 * relative time is the surface's own sentence rather than the formatter's
 * (ADR-0104): [timeAgoParts] answers a unit and a count, and the words come from
 * this component's generated copy, so the two clients cannot word it differently.
 *
 * `now` is an argument so a test can hold the boundaries still, exactly as the
 * web's `timeAgoParts` takes it.
 */
object ConnectedAppsText {
    /** The row's name: the client's own, or the generic one the site falls back to. */
    fun name(app: ConnectedApp): String =
        app.name?.takeIf { it.isNotBlank() } ?: ConnectedAppsCopy.APP_NAME

    /** `آخر استخدام: …` — the label, then the time or the never-used line. */
    fun lastUsed(app: ConnectedApp, now: Instant = Instant.now()): String =
        "${ConnectedAppsCopy.LAST_USED} ${timeAgo(app.lastUsedAt, now)}"

    /**
     * What a past instant is, in this card's words. An unused client is the
     * site's own sentence, and a date older than four weeks is the Hijri day the
     * site prints instead of a count of months ([PlanDates]).
     */
    fun timeAgo(iso: String?, now: Instant = Instant.now()): String {
        if (iso == null) return ConnectedAppsCopy.NEVER_USED

        val parts = timeAgoParts(iso, now)
        return when (parts.unit) {
            TimeAgoParts.Unit.NOW -> ConnectedAppsCopy.AGO_NOW
            TimeAgoParts.Unit.MINUTES -> withCount(ConnectedAppsCopy.AGO_MINUTES, parts.count)
            TimeAgoParts.Unit.HOURS -> withCount(ConnectedAppsCopy.AGO_HOURS, parts.count)
            TimeAgoParts.Unit.DAYS -> withCount(ConnectedAppsCopy.AGO_DAYS, parts.count)
            TimeAgoParts.Unit.WEEKS -> withCount(ConnectedAppsCopy.AGO_WEEKS, parts.count)
            TimeAgoParts.Unit.DATE -> PlanDates.label(iso)
        }
    }

    /** `متَّصل منذ …`, with the Hijri day substituted. */
    fun connectedSince(app: ConnectedApp): String =
        ConnectedAppsCopy.CONNECTED_SINCE.replace("{date}", PlanDates.label(app.connectedAt))

    /** The row button's accessible name: the site's `فصل {name}`. */
    fun disconnectLabel(app: ConnectedApp): String =
        ConnectedAppsCopy.DISCONNECT_ARIA.replace("{name}", name(app))

    /** The confirmation's sentence, with the client's name in it. */
    fun confirmMessage(app: ConnectedApp): String =
        ConnectedAppsCopy.CONFIRM_DISCONNECT_MESSAGE.replace("{name}", name(app))

    /**
     * A count, in ASCII: an Arabic-locale phone must not renumber it in
     * Arabic-Indic digits, so the number is formatted by [Long.toString] rather
     * than by the device's locale.
     */
    private fun withCount(sentence: String, count: Long): String =
        sentence.replace("{count}", count.toString())
}
