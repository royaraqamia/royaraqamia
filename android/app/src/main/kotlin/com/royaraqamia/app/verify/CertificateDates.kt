package com.royaraqamia.app.verify

import com.royaraqamia.app.plans.PlanDates

/**
 * The certificate card's dates (#658).
 *
 * The site formats both of them with `formatDateArabic` →
 * `Intl.DateTimeFormat('ar-SA', { calendar: 'islamic-umalqura', numberingSystem:
 * 'latn' })` (`frontend/shared/format.ts`), which is the same sentence [PlanDates]
 * already produces for the plan card — Umm al-Qura, Arabic month names, ASCII
 * digits. Reusing it rather than writing a second formatter is what keeps one
 * calendar in the app.
 *
 * The one difference is how a value is read: a certificate date can be a calendar
 * day (`2026-01-01`) or an instant. The site hands both to `new Date`, which reads
 * a day as UTC midnight and then formats it in the reader's zone, so a day is
 * resolved the same way here before it reaches the formatter.
 */
object CertificateDates {
    private val dayOnly = Regex("""^\d{4}-\d{2}-\d{2}$""")

    /** A stored certificate date, in the site's own Hijri sentence. */
    fun label(value: String): String =
        if (dayOnly.matches(value)) PlanDates.label("${value}T00:00:00Z") else PlanDates.label(value)
}
