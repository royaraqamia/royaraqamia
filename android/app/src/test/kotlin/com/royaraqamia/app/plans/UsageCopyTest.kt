package com.royaraqamia.app.plans

import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * The card's words and numbers (#647).
 *
 * The counts are the half a locale can quietly break: the site formats with
 * `toLocaleString('en-US')`, so the app has to produce the same ASCII, comma-
 * grouped string on a phone whose language is Arabic. A device-locale format would
 * answer in Arabic-Indic digits instead, which is a second numbering system in front
 */
class UsageCopyTest {
    @Test
    fun `a count is ASCII and grouped the way the site groups it`() {
        assertEquals("0", UsageCopy.count(0))
        assertEquals("999", UsageCopy.count(999))
        assertEquals("1,200", UsageCopy.count(1_200))
        assertEquals("12,345,678", UsageCopy.count(12_345_678))
    }

    @Test
    fun `a plan id becomes the site's label`() {
        assertEquals(UsageCopy.PLAN_FREE, UsageCopy.planLabel("free"))
        assertEquals(UsageCopy.PLAN_PRO, UsageCopy.planLabel("pro"))
    }

    @Test
    fun `an unknown plan id is shown rather than blanked`() {
        assertEquals("team", UsageCopy.planLabel("team"))
    }
}
