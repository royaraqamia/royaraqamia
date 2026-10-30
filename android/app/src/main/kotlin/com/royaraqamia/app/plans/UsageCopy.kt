package com.royaraqamia.app.plans

import java.text.NumberFormat
import java.util.Locale

/**
 * The card's numbers (#647, #648). The words are in [PlanCardCopy], generated from
 * the same file the site's module comes from; nothing user-facing is spelled here.
 *
 * A count is ASCII, grouped the way the site groups it (`toLocaleString('en-US')`),
 * and drawn in Aref Ruqaa by the card through `RoyTypeScale.digits`. The app never
 * formats a count with the device's locale, because an Arabic-locale phone would
 * then answer in a second numbering system.
 */
object UsageCopy {
    private val grouping: NumberFormat = NumberFormat.getIntegerInstance(Locale.US)

    /** A plan's label; an unknown id is shown as it came rather than blanked. */
    fun planLabel(plan: String): String =
        when (plan) {
            "free" -> PlanCardCopy.PLAN_FREE
            "pro" -> PlanCardCopy.PLAN_PRO
            else -> plan
        }

    /** A count as the site writes it: ASCII digits, grouped with commas. */
    fun count(value: Long): String = grouping.format(value)

    /** The site's sentence, with the date substituted into its placeholder. */
    fun expires(date: String): String = PlanCardCopy.EXPIRES.replace("{date}", date)
}
