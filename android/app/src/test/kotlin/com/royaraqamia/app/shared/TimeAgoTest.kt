package com.royaraqamia.app.shared

import org.junit.Assert.assertEquals
import org.junit.Test
import java.time.Instant

/**
 * The thresholds of "time ago", held to the site's (ADR-0104).
 *
 * The web half is `frontend/shared/__tests__/format-time-ago.test.ts` and asserts
 * the same boundaries; the words are not tested here because they are the
 * surface's generated copy, not the formatter's.
 */
class TimeAgoTest {
    private val now = Instant.parse("2026-10-30T12:00:00.000Z")

    private fun at(secondsAgo: Long) =
        timeAgoParts(now.minusSeconds(secondsAgo).toString(), now)

    @Test
    fun `under a minute is now`() {
        assertEquals(TimeAgoParts(TimeAgoParts.Unit.NOW), at(0))
        assertEquals(TimeAgoParts(TimeAgoParts.Unit.NOW), at(59))
    }

    @Test
    fun `minutes, then hours, then days, then weeks`() {
        assertEquals(TimeAgoParts(TimeAgoParts.Unit.MINUTES, 1), at(60))
        assertEquals(TimeAgoParts(TimeAgoParts.Unit.MINUTES, 59), at(59 * 60))
        assertEquals(TimeAgoParts(TimeAgoParts.Unit.HOURS, 1), at(60 * 60))
        assertEquals(TimeAgoParts(TimeAgoParts.Unit.HOURS, 23), at(23 * 3600))
        assertEquals(TimeAgoParts(TimeAgoParts.Unit.DAYS, 1), at(24 * 3600))
        assertEquals(TimeAgoParts(TimeAgoParts.Unit.DAYS, 6), at(6 * 86_400))
        assertEquals(TimeAgoParts(TimeAgoParts.Unit.WEEKS, 1), at(7 * 86_400))
        assertEquals(TimeAgoParts(TimeAgoParts.Unit.WEEKS, 3), at(27 * 86_400))
    }

    @Test
    fun `a month or more is a date`() {
        assertEquals(TimeAgoParts(TimeAgoParts.Unit.DATE), at(28 * 86_400))
        assertEquals(TimeAgoParts(TimeAgoParts.Unit.DATE), timeAgoParts("not a date", now))
    }
}
