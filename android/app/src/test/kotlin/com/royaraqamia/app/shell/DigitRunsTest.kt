package com.royaraqamia.app.shell

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Which runs of a card's sentence take the read-only digit face (#652).
 *
 * The cases are `DigitRangesTest`'s, moved with the code they cover: the Java
 * helper and its `TextView` spans are gone, and what is left is the arithmetic
 * the Compose card styles. Arabic-Indic and Persian numerals are the point — the
 * app writes ASCII digits everywhere, so a run of them is not a number the digit
 * subset can draw (ADR-0054).
 */
class DigitRunsTest {

    private fun runs(text: String): List<String> = digitRunsOf(text).map { text.substring(it) }

    @Test
    fun `a whole percentage is one run`() {
        assertEquals(listOf("42"), runs("42%"))
    }

    @Test
    fun `versions and sizes are separate runs`() {
        assertEquals(
            listOf("1.0.2", "1.0.4", "7.1"),
            runs("تحديث من 1.0.2 إلى 1.0.4 · 7.1 م.ب"),
        )
    }

    @Test
    fun `a grouped count keeps its separators`() {
        assertEquals(listOf("1,250.00"), runs("1,250.00"))
    }

    @Test
    fun `a sentence with no numbers has no runs`() {
        assertTrue(runs("جاري تنزيل التَّحديث…").isEmpty())
        assertTrue(runs("").isEmpty())
    }

    @Test
    fun `Arabic-Indic digits are not runs`() {
        assertTrue(runs("\u0661\u0662\u0663").isEmpty())
        assertTrue(runs("\u06F1\u06F2\u06F3").isEmpty())
    }
}
