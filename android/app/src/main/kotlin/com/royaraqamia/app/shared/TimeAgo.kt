package com.royaraqamia.app.shared

import java.time.Duration
import java.time.Instant

/**
 * What a past instant is, before a surface puts it into words (ADR-0104).
 *
 * The thresholds are the site's (`frontend/shared/format.ts`), and the words are
 * not here: each surface renders its own layer's generated copy with `{count}`
 * substituted, so the Arabic cannot be right on one client and wrong on the other.
 */
data class TimeAgoParts(val unit: Unit, val count: Long = 0) {
    enum class Unit {
        /** Less than a minute ago. */
        NOW,

        MINUTES,
        HOURS,
        DAYS,
        WEEKS,

        /** A month or more: the surface shows a date instead. */
        DATE,
    }
}

/** The site's `timeAgoParts`, with `now` an argument so a test can hold the boundaries. */
fun timeAgoParts(iso: String, now: Instant = Instant.now()): TimeAgoParts {
    val then = runCatching { Instant.parse(iso) }.getOrNull() ?: return TimeAgoParts(TimeAgoParts.Unit.DATE)

    val seconds = Duration.between(then, now).seconds
    if (seconds < 60) return TimeAgoParts(TimeAgoParts.Unit.NOW)

    val minutes = seconds / 60
    if (minutes < 60) return TimeAgoParts(TimeAgoParts.Unit.MINUTES, minutes)

    val hours = minutes / 60
    if (hours < 24) return TimeAgoParts(TimeAgoParts.Unit.HOURS, hours)

    val days = hours / 24
    if (days < 7) return TimeAgoParts(TimeAgoParts.Unit.DAYS, days)

    val weeks = days / 7
    if (weeks < 4) return TimeAgoParts(TimeAgoParts.Unit.WEEKS, weeks)

    return TimeAgoParts(TimeAgoParts.Unit.DATE)
}
