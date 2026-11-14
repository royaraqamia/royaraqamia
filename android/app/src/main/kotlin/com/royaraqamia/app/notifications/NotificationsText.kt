package com.royaraqamia.app.notifications

import com.royaraqamia.app.shared.TimeAgoParts
import com.royaraqamia.app.shared.timeAgoParts
import java.time.Instant

/**
 * The notifications surface's words (#1391, ADR-0104).
 *
 * The thresholds are the shared formatter's, and the sentences are this
 * surface's generated copy, so a row and the page draw "two hours ago" from the
 * same Arabic rather than two spellings of it.
 */
object NotificationsText {
    /** What a past instant is, in the surface's own words. */
    fun timeAgo(iso: String, now: Instant = Instant.now()): String {
        val parts = timeAgoParts(iso, now)
        return when (parts.unit) {
            TimeAgoParts.Unit.NOW -> NotificationsCopy.AGO_NOW
            TimeAgoParts.Unit.MINUTES -> count(NotificationsCopy.AGO_MINUTES, parts.count)
            TimeAgoParts.Unit.HOURS -> count(NotificationsCopy.AGO_HOURS, parts.count)
            TimeAgoParts.Unit.DAYS -> count(NotificationsCopy.AGO_DAYS, parts.count)
            TimeAgoParts.Unit.WEEKS -> count(NotificationsCopy.AGO_WEEKS, parts.count)
            TimeAgoParts.Unit.DATE -> com.royaraqamia.app.plans.PlanDates.label(iso)
        }
    }

    private fun count(template: String, value: Long): String = template.replace("{count}", value.toString())
}
