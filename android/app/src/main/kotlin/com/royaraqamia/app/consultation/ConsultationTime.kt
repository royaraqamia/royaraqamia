package com.royaraqamia.app.consultation

import com.royaraqamia.app.contracts.generated.AvailabilitySlotsResponseSlotsItem
import com.royaraqamia.app.plans.PlanDates
import java.time.Instant
import java.time.OffsetDateTime
import java.time.ZoneId
import java.time.ZonedDateTime
import java.time.format.DateTimeFormatter
import java.time.format.DecimalStyle
import java.util.Locale

/**
 * The booking page's session times (#930).
 *
 * The date is the app's one Hijri formatter ([PlanDates]) with the weekday the
 * page also prints, so the booking and the plan card cannot disagree about a
 * month; the time is 12-hour with ASCII digits because the site's `Intl` call
 * asks for `numberingSystem: 'latn'`. A visitor outside Damascus also sees the
 * Damascus date and range when the day differs, exactly as the page adds it.
 */
object ConsultationTime {
    private val damascus = ZoneId.of("Asia/Damascus")

    private val weekday: DateTimeFormatter =
        DateTimeFormatter.ofPattern("EEEE", Locale.forLanguageTag("ar"))

    private val clock: DateTimeFormatter =
        DateTimeFormatter.ofPattern("h:mm a", Locale.forLanguageTag("ar"))
            .withDecimalStyle(DecimalStyle.STANDARD)

    /** e.g. "2026-08-26": the local day the slots are grouped under. */
    fun dayKey(iso: String): String =
        instantOf(iso)?.let {
            ZonedDateTime.ofInstant(it, ZoneId.systemDefault()).toLocalDate().toString()
        } ?: iso

    /** e.g. "الأربعاء، 13 ربيع الأول 1448 هـ". */
    fun dateLabel(iso: String): String {
        val instant = instantOf(iso) ?: return iso
        val day = weekday.format(instant.atZone(ZoneId.systemDefault()))
        return "$day، ${PlanDates.label(iso)}"
    }

    /** e.g. "7:00 م – 8:00 م", in the device's own zone. */
    fun range(slot: AvailabilitySlotsResponseSlotsItem): String =
        range(slot.starts_at, slot.ends_at, ZoneId.systemDefault())

    /** The Damascus line, or null when the device is already on Damascus time. */
    fun damascusHint(slot: AvailabilitySlotsResponseSlotsItem): String? {
        if (ZoneId.systemDefault() == damascus) return null
        val dayDiffers =
            dayKeyIn(slot.starts_at, ZoneId.systemDefault()) !=
                dayKeyIn(slot.starts_at, damascus)
        val times = range(slot.starts_at, slot.ends_at, damascus)
        return if (dayDiffers) "${PlanDates.label(slot.starts_at, damascus)} — $times" else times
    }

    private fun range(start: String, end: String, zone: ZoneId): String {
        val from = instantOf(start) ?: return start
        val to = instantOf(end) ?: return end
        return "${clock.format(from.atZone(zone))} – ${clock.format(to.atZone(zone))}"
    }

    private fun dayKeyIn(iso: String, zone: ZoneId): String =
        instantOf(iso)?.let { ZonedDateTime.ofInstant(it, zone).toLocalDate().toString() } ?: iso

    private fun instantOf(iso: String): Instant? =
        runCatching { Instant.parse(iso) }.getOrNull()
            ?: runCatching { OffsetDateTime.parse(iso).toInstant() }.getOrNull()
}
