package com.royaraqamia.app.plans

import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * An amount as the site writes it (#647, ADR-0098).
 *
 * The page formats with `toLocaleString('en-US', ...)` and prefixes `$`: whole
 * dollars carry no decimals, cents carry two, and a currency that is not the
 * dollar trails the figure. A device-locale format would answer in Arabic-Indic
 * digits, which is the same trap the counts avoid.
 */
class PlanMoneyTest {
    @Test
    fun `a whole amount of dollars carries no decimals`() {
        assertEquals("\$12", PlanMoney.label(1_200, "USD"))
        assertEquals("\$0", PlanMoney.label(0, "USD"))
        assertEquals("\$1,000", PlanMoney.label(100_000, "USD"))
    }

    @Test
    fun `cents are two decimals, like the site's minimumFractionDigits`() {
        assertEquals("\$12.50", PlanMoney.label(1_250, "USD"))
        assertEquals("\$12.05", PlanMoney.label(1_205, "USD"))
        assertEquals("\$1,234.56", PlanMoney.label(123_456, "USD"))
    }

    @Test
    fun `a currency that is not the dollar trails the figure`() {
        assertEquals("50 SYP", PlanMoney.label(5_000, "SYP"))
    }
}
