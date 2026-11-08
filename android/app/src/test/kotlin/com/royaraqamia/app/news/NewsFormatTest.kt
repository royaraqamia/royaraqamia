package com.royaraqamia.app.news

import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * The day strip and the card allowance in the page's own figures (#926).
 *
 * The date is a stored `YYYY-MM-DD` and must not be read as an instant at UTC
 * midnight: a device west of UTC would then print the day before. The count is
 * en-US grouping in ASCII digits (ADR-0054), the same shape the page's
 * `formatCount` writes.
 */
class NewsFormatTest {
    @Test
    fun `a calendar day is read as a date, not as an instant`() {
        assertEquals("8 نوفمبر", NewsFormat.archiveDay("2026-11-08"))
    }

    @Test
    fun `a value that is not a day is drawn as it came`() {
        assertEquals("not-a-day", NewsFormat.archiveDay("not-a-day"))
    }

    @Test
    fun `counts group in ASCII digits`() {
        assertEquals("1,200", NewsFormat.count(1200))
    }
}
