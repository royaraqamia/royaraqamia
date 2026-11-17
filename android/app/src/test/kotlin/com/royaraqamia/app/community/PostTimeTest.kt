package com.royaraqamia.app.community

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import java.time.Instant

/**
 * The feed's age ladder and the sentence it chooses, held to the site's (ADR-0098).
 *
 * The thresholds are the site's (`shared/relative-time.ts`): minute, hour, day,
 * week, month, year, with each count rounded rather than truncated. The words
 * are [PostTimeCopy], generated from `shared/copy/post-time.json`, so nothing
 * here retypes Arabic - and the site's half of the pair sweeps that same copy
 * against `formatRelativeTime`
 * (`app/community/_components/__tests__/post-time.test.tsx`), which is what
 * keeps one sentence in two clients.
 */
class PostTimeTest {
    private val now = Instant.parse("2026-11-17T12:00:00.000Z")

    private fun at(secondsAgo: Long) = now.minusSeconds(secondsAgo).toString()

    @Test
    fun `rounds to zero minutes for the last half-minute`() {
        assertEquals(PostTimeState.Now, postTimeState(at(0), now))
        assertEquals(PostTimeState.Now, postTimeState(at(29), now))
        assertEquals(PostTimeState.Minutes(1), postTimeState(at(30), now))
        assertEquals(PostTimeState.Minutes(59), postTimeState(at(59 * 60), now))
        assertEquals(PostTimeState.Hours(1), postTimeState(at(59 * 60 + 40), now))
    }

    @Test
    fun `walks minutes, hours, days, weeks, months, then years`() {
        assertEquals(PostTimeState.Minutes(1), postTimeState(at(60), now))
        assertEquals(PostTimeState.Hours(3), postTimeState(at(3 * 3_600), now))
        assertEquals(PostTimeState.Days(1), postTimeState(at(24 * 3_600), now))
        assertEquals(PostTimeState.Weeks(1), postTimeState(at(7 * 86_400), now))
        assertEquals(PostTimeState.Months(1), postTimeState(at(30 * 86_400), now))
        assertEquals(PostTimeState.Years(2), postTimeState(at(730 * 86_400), now))
    }

    @Test
    fun `each rung reads from the generated copy, in Arabic's plural form`() {
        assertEquals(PostTimeCopy.NOW, postTimeLabel(at(0), now))
        assertEquals(PostTimeCopy.MINUTE_ONE, postTimeLabel(at(60), now))
        assertEquals(PostTimeCopy.MINUTE_TWO, postTimeLabel(at(2 * 60), now))
        assertEquals(
            PostTimeCopy.MINUTE_FEW.replace("{count}", "3"),
            postTimeLabel(at(3 * 60), now),
        )
        assertEquals(
            PostTimeCopy.MINUTE_MANY.replace("{count}", "11"),
            postTimeLabel(at(11 * 60), now),
        )
        assertEquals(PostTimeCopy.HOUR_TWO, postTimeLabel(at(2 * 3_600), now))
        assertEquals(
            PostTimeCopy.HOUR_FEW.replace("{count}", "3"),
            postTimeLabel(at(3 * 3_600), now),
        )
        assertEquals(PostTimeCopy.DAY_ONE, postTimeLabel(at(24 * 3_600), now))
        assertEquals(PostTimeCopy.WEEK_ONE, postTimeLabel(at(7 * 86_400), now))
        assertEquals(
            PostTimeCopy.WEEK_FEW.replace("{count}", "4"),
            postTimeLabel(at(4 * 7 * 86_400), now),
        )
        assertEquals(PostTimeCopy.MONTH_ONE, postTimeLabel(at(30 * 86_400), now))
        assertEquals(
            PostTimeCopy.MONTH_TWO,
            postTimeLabel(at(2 * 30 * 86_400), now),
        )
        assertEquals(PostTimeCopy.YEAR_ONE, postTimeLabel(at(365 * 86_400), now))
    }

    @Test
    fun `a thousand years still reads as a number the member can parse`() {
        assertEquals(
            PostTimeCopy.YEAR_OTHER.replace("{count}", "1,000"),
            postTimeLabel(at(1_000L * 365 * 86_400), now),
        )
    }

    @Test
    fun `a string that is not an instant earns no sentence`() {
        assertNull(postTimeState("not a date", now))
        assertNull(postTimeLabel("not a date", now))
    }
}
