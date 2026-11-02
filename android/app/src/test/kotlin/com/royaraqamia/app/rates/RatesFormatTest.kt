package com.royaraqamia.app.rates

import org.junit.Assert.assertEquals
import org.junit.Test
import java.util.Locale

/**
 * The figures and the day the rates screen prints (#658).
 *
 * `frontend/ui/rates/rate-format.tsx` formats the figure the way
 * `shared/currency.ts` already formats an amount — `ar-SA-u-nu-latn`, which is
 * `en-US` grouping in ASCII digits — so the app writes the same figure with the
 * same shape. An Arabic-locale phone must not answer in Arabic-Indic numerals in a
 * number the site draws as `13,800` (ADR-0054).
 */
class RatesFormatTest {
    @Test
    fun `a figure is grouped and has no decimals`() {
        assertEquals("13,800", RatesFormat.value(13_800.0))
        assertEquals("1,380,000", RatesFormat.value(1_380_000.0))
        assertEquals("0", RatesFormat.value(0.4))
        assertEquals("3.75 rounds to the site's zero decimals", "4", RatesFormat.value(3.75))
    }

    @Test
    fun `the figure never uses Arabic-Indic digits, whatever the device locale is`() {
        val previous = Locale.getDefault()
        try {
            Locale.setDefault(Locale.forLanguageTag("ar-SA"))
            assertEquals("13,800", RatesFormat.value(13_800.0))
        } finally {
            Locale.setDefault(previous)
        }
    }

    @Test
    fun `a symbol comes from the currency table the site writes`() {
        assertEquals("$", RatesFormat.symbol("USD"))
        assertEquals("ر.س", RatesFormat.symbol("SAR"))
        assertEquals("an unknown code falls back to the table's default", "$", RatesFormat.symbol("XYZ"))
    }

    @Test
    fun `a quote day is the site's Hijri sentence and its Gregorian one`() {
        // The Hijri string is the one `shared/fixtures/parity/hijri-dates.json` pins
        // for 2026-11-21, so this test reads the same calendar the site does.
        assertEquals("11 جمادى الآخرة 1448 هـ", RatesFormat.hijri("2026-11-21"))
        assertEquals("21 نوفمبر 2026 م", RatesFormat.gregorian("2026-11-21"))
    }

    @Test
    fun `a day that is not a date is shown as it came`() {
        assertEquals("not-a-day", RatesFormat.gregorian("not-a-day"))
    }
}
