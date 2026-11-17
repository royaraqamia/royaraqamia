package com.royaraqamia.app.community

import java.time.Duration
import java.time.Instant

/**
 * What an instant earns on the feed's ladder (#1580), before a surface puts it
 * into words.
 *
 * The thresholds and the rounding are the site's (`shared/relative-time.ts`,
 * `relativeTimeParts`): minute, then hour, then day, then week, then month, then
 * year, with each count rounded rather than truncated, so the card and the
 * thread cannot say 59 minutes where the page says «قبل ساعة».
 *
 * The words are not here: [PostTime.kt] renders them from the generated
 * [PostTimeCopy], which is the same file that writes the site's module.
 */
sealed interface PostTimeState {
    data object Now : PostTimeState

    data class Minutes(val count: Long) : PostTimeState

    data class Hours(val count: Long) : PostTimeState

    data class Days(val count: Long) : PostTimeState

    data class Weeks(val count: Long) : PostTimeState

    data class Months(val count: Long) : PostTimeState

    data class Years(val count: Long) : PostTimeState
}

/**
 * The site's ladder, with `now` an argument so a test can hold the boundaries.
 *
 * A string that is not an instant earns nothing: the page draws no age for a
 * timestamp it cannot read, rather than counting from the epoch. Rounded in
 * milliseconds, as the site is, so a 59-minute-old post is an hour on both.
 */
fun postTimeState(iso: String, now: Instant = Instant.now()): PostTimeState? {
    val then = runCatching { Instant.parse(iso) }.getOrNull() ?: return null

    val minutes = Math.round(Duration.between(then, now).toMillis() / 60_000.0)
    if (minutes < 1) return PostTimeState.Now
    if (minutes < 60) return PostTimeState.Minutes(minutes)

    val hours = Math.round(minutes / 60.0)
    if (hours < 24) return PostTimeState.Hours(hours)

    val days = Math.round(hours / 24.0)
    if (days < 7) return PostTimeState.Days(days)
    if (days < 30) return PostTimeState.Weeks(Math.round(days / 7.0))
    if (days < 365) return PostTimeState.Months(Math.round(days / 30.0))

    return PostTimeState.Years(Math.round(days / 365.0))
}
