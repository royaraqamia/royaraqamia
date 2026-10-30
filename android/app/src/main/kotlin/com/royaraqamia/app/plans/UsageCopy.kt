package com.royaraqamia.app.plans

import java.text.NumberFormat
import java.util.Locale

/**
 * The card's words (#647, #648), copied from the site rather than written again.
 *
 * Every line here is the exact string `frontend/ui/account/plan-view.tsx` renders,
 * byte for byte: Arabic writes a letter's marks in more than one order and the two
 * compare unequal while rendering the same, so a retyped label is a label that
 * fails an exact-text test later. A copy change on the site is a change here.
 *
 * The numbers are the other half of the same rule. They are ASCII, grouped the way
 * the site groups them (`toLocaleString('en-US')`), and drawn in Aref Ruqaa by the
 * card through `RoyTypeScale.digits` — the app never formats a count with the
 * device's locale, because an Arabic-locale phone would then answer in a second
 * numbering system.
 */
object UsageCopy {
    /** The badge on an account with no cap. */
    const val UNLIMITED = "غير محدود"

    /** The section title above the counters. */
    const val TITLE = "خطتك الحالية"

    /** What a member's plan badge reads when the plan is not unlimited. */
    const val PLAN_FREE = "الخطَّة المجَّانيَّة"
    const val PLAN_PRO = "الخطَّة المدفوعة"

    /** The read failed, or the server answered with something the card cannot show. */
    const val FAILED = "تعذّر تحميل بيانات اشتراكك."
    const val RETRY = "إعادة المحاولة"

    /** A session is required, and there is not one. */
    const val SIGNED_OUT = "سجِّل الدُّخول لعرض اشتراكك"
    const val SIGNED_OUT_BODY = "استهلاكك وسجلّ الاشتراك يتبعان حسابك."

    private val grouping = NumberFormat.getIntegerInstance(Locale.US)

    /** A plan's label; an unknown id is shown as it came rather than blanked. */
    fun planLabel(plan: String): String =
        when (plan) {
            "free" -> PLAN_FREE
            "pro" -> PLAN_PRO
            else -> plan
        }

    /** A count as the site writes it: ASCII digits, grouped with commas. */
    fun count(value: Long): String = grouping.format(value)
}
