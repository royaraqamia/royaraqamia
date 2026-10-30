package com.royaraqamia.app.plans

import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * The card's numbers (#647) — the half a locale can quietly break.
 *
 * The words themselves are generated from `shared/copy/plan-card.json` and pinned
 * by `npm run check:copy`; what this suite holds is the app's own rule: a count is
 * ASCII and grouped exactly the way `toLocaleString('en-US')` groups it, on a
 * phone whose language is Arabic.
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
        assertEquals(PlanCardCopy.PLAN_FREE, UsageCopy.planLabel("free"))
        assertEquals(PlanCardCopy.PLAN_PRO, UsageCopy.planLabel("pro"))
    }

    @Test
    fun `an unknown plan id is shown rather than blanked`() {
        assertEquals("team", UsageCopy.planLabel("team"))
    }

    @Test
    fun `a payment method becomes the page's label`() {
        assertEquals(PlanCardCopy.METHOD_SHAMCASH, UsageCopy.methodLabel("shamcash"))
        assertEquals(PlanCardCopy.METHOD_EFENDIM, UsageCopy.methodLabel("efendim"))
        assertEquals(PlanCardCopy.METHOD_OTHER, UsageCopy.methodLabel("other"))
        assertEquals("bank", UsageCopy.methodLabel("bank"))
    }

    @Test
    fun `the expiry sentence substitutes its placeholder and keeps the rest`() {
        val sentence = UsageCopy.expires("23 شعبان 1448 هـ")

        // The words are the site's; the app may not reformat around them.
        assertEquals(PlanCardCopy.EXPIRES.replace("{date}", "23 شعبان 1448 هـ"), sentence)
        assertEquals(false, sentence.contains("{date}"))
    }
}
