package com.royaraqamia.app.spendtrack

import com.royaraqamia.app.store.spendtrack.SpendtrackExpenseRow
import java.util.Locale
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * The figures SpendTrack draws, in the site's own words (#653).
 *
 * The rule the ticket names is digits: the site writes `1,250.00` on every
 * device, so an Arabic-locale phone must not answer `١٬٢٥٠٫٠٠` — that is
 * ADR-0054, and the assertions here run under an Arabic default locale on
 * purpose, because a test that passes under `en-US` proves nothing about the
 * phone that fails.
 */
class SpendtrackMoneyTest {
    private val previous: Locale = Locale.getDefault()

    @org.junit.After
    fun restore() {
        Locale.setDefault(previous)
    }

    @Test
    fun `an amount is ASCII digits with two decimals under an Arabic locale`() {
        Locale.setDefault(Locale.forLanguageTag("ar-SA"))

        assertEquals("$1,250.00", SpendtrackMoney.label(1250.0, "USD"))
        assertEquals("12.50 ر.س", SpendtrackMoney.label(12.5, "SAR"))
    }

    @Test
    fun `an unknown code falls back to the site's default`() {
        assertEquals("$9.00", SpendtrackMoney.label(9.0, "ZZZ"))
        assertEquals("$9.00", SpendtrackMoney.label(9.0, null))
    }

    @Test
    fun `a typed amount folds Arabic-Indic digits and rejects what is not positive`() {
        assertEquals(12.5, parseAmount("١٢٫٥")!!, 0.0)
        assertEquals(1250.0, parseAmount("1,250")!!, 0.0)
        assertNull("zero is not an expense", parseAmount("0"))
        assertNull("nor is a word", parseAmount("كم"))
    }

    @Test
    fun `the total is the month the device is in`() {
        val rows =
            listOf(
                expense("2026-01-31", 10.0),
                expense("2026-01-01", 5.5),
                expense("2025-12-31", 100.0),
            )

        assertEquals(15.5, monthTotal(rows, "2026-01"), 0.0)
    }

    @Test
    fun `a category colour is the site's hex or the muted surface`() {
        assertTrue(isHexColor("#8f6fe5"))
        assertFalse(isHexColor("8f6fe5"))
        assertFalse(isHexColor("#8f6fe"))
    }

    private fun expense(date: String, amount: Double): SpendtrackExpenseRow =
        SpendtrackExpenseRow(
            id = "e-$date",
            categoryId = "c-1",
            amount = amount,
            description = null,
            date = date,
            currency = null,
            createdAt = "${date}T00:00:00.000Z",
            splits = null,
            clientId = "e-$date",
            updatedAt = "${date}T00:00:00.000Z",
            deletedAt = null,
        )
}
