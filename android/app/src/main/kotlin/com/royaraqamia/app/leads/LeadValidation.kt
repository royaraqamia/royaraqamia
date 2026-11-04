package com.royaraqamia.app.leads

import com.royaraqamia.app.store.leads.LeadDraft
import com.royaraqamia.app.store.leads.LeadKind
import com.royaraqamia.app.store.outbox.SystemWriteClock
import java.net.URI
import java.text.SimpleDateFormat
import java.util.Locale
import java.util.UUID

/**
 * The three pages' validation, in the app (#929).
 *
 * The rules and the sentences are the shared Zod schemas' own: the name floor
 * and ceiling, the permissive WhatsApp phone shape, the email and URL formats,
 * the project and retainer prose floors, the enums behind the two selects and
 * the create-time date floor. A submission that does not pass here is never
 * queued, because a queued write the server will always refuse is a queue that
 * can never drain.
 *
 * The messages are kept beside the rules in [LeadsCopy] rather than invented
 * per screen, so a rejected field says to an app visitor what it says on the
 * page.
 */
object LeadValidation {
    private val PHONE = Regex("""^[+]?[\d\s-]{7,20}$""")

    /** Close to `z.email()`'s shape: a local part, an `@`, and a dotted domain. */
    private val EMAIL = Regex(
        """^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@""" +
            """[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?""" +
            """(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$"""
    )

    private val ISO_DATE = Regex("""^\d{4}-\d{2}-\d{2}$""")
    private val UUID_SHAPE =
        Regex("""^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$""")
    private val PROJECT_TYPES = setOf("website", "app")
    private val BUDGET_RANGES = setOf("under-300", "300-600", "600-1200", "over-1200")
    private val TIMELINES =
        setOf("within-a-month", "one-to-three-months", "three-to-six-months", "flexible")

    /** Every error on a form, keyed by the field the screen points at. */
    fun errors(
        kind: LeadKind,
        draft: LeadDraft,
        today: String = SystemWriteClock.today(),
    ): Map<LeadField, String> =
        LeadField.of(kind)
            .mapNotNull { field -> fieldError(kind, field, draft, today)?.let { field to it } }
            .toMap()

    fun fieldError(
        kind: LeadKind,
        field: LeadField,
        draft: LeadDraft,
        today: String = SystemWriteClock.today(),
    ): String? {
        val value = valueOf(field, draft).trim()
        return when (field) {
            LeadField.FullName -> nameError(value)
            LeadField.Phone ->
                if (PHONE.matches(value)) null else LeadsCopy.ERR_PHONE
            LeadField.Email -> emailError(value)
            LeadField.Goal ->
                if (value.length <= 1000) null else LeadsCopy.ERR_GOAL_LONG
            LeadField.Cohort ->
                when {
                    value.isEmpty() -> LeadsCopy.ERR_COHORT_REQUIRED
                    !isUuid(value) -> LeadsCopy.ERR_COHORT_INVALID
                    else -> null
                }
            LeadField.ProjectType ->
                if (value in PROJECT_TYPES) null else LeadsCopy.ERR_PROJECT_TYPE
            LeadField.Description -> proseError(
                value = value,
                min = 30,
                short = LeadsCopy.ERR_DESCRIPTION_SHORT,
                long = LeadsCopy.ERR_DESCRIPTION_LONG,
            )
            LeadField.BudgetRange ->
                if (value.isEmpty() || value in BUDGET_RANGES) null else LeadsCopy.ERR_BUDGET
            LeadField.Timeline ->
                if (value.isEmpty() || value in TIMELINES) null else LeadsCopy.ERR_TIMELINE
            LeadField.ExistingUrl -> urlError(value)
            LeadField.Company ->
                if (value.length <= 120) null else LeadsCopy.ERR_COMPANY_LONG
            LeadField.CurrentProjects -> proseError(
                value = value,
                min = 30,
                short = LeadsCopy.ERR_PROJECTS_SHORT,
                long = LeadsCopy.ERR_PROJECTS_LONG,
            )
            LeadField.Needs -> proseError(
                value = value,
                min = 30,
                short = LeadsCopy.ERR_NEEDS_SHORT,
                long = LeadsCopy.ERR_NEEDS_LONG,
            )
            LeadField.PreferredStart -> dateError(value, today)
        }
    }

    private fun valueOf(field: LeadField, draft: LeadDraft): String = when (field) {
        LeadField.FullName -> draft.fullName
        LeadField.Phone -> draft.phone
        LeadField.Email -> draft.email
        LeadField.Goal -> draft.goal
        LeadField.Cohort -> draft.cohortId
        LeadField.ProjectType -> draft.projectType
        LeadField.Description -> draft.description
        LeadField.BudgetRange -> draft.budgetRange
        LeadField.Timeline -> draft.timeline
        LeadField.ExistingUrl -> draft.existingUrl
        LeadField.Company -> draft.company
        LeadField.CurrentProjects -> draft.currentProjects
        LeadField.Needs -> draft.needs
        LeadField.PreferredStart -> draft.preferredStart
    }

    private fun nameError(value: String): String? = when {
        value.length < 2 -> LeadsCopy.ERR_NAME_SHORT
        value.length > 120 -> LeadsCopy.ERR_NAME_LONG
        else -> null
    }

    private fun emailError(value: String): String? = when {
        value.isEmpty() -> null
        value.length > 200 -> LeadsCopy.ERR_EMAIL_LONG
        !EMAIL.matches(value) -> LeadsCopy.ERR_EMAIL
        else -> null
    }

    private fun proseError(value: String, min: Int, short: String, long: String): String? =
        when {
            value.length < min -> short
            value.length > 2000 -> long
            else -> null
        }

    private fun urlError(value: String): String? = when {
        value.isEmpty() -> null
        value.length > 500 -> LeadsCopy.ERR_URL_LONG
        !isUrl(value) -> LeadsCopy.ERR_URL
        else -> null
    }

    private fun dateError(value: String, today: String): String? {
        if (value.isEmpty()) return null
        if (!isIsoDate(value)) return LeadsCopy.ERR_DATE
        // Date-only strings compare lexicographically, the way the schema's
        // `isTodayOrLater` does.
        return if (value < today) LeadsCopy.ERR_DATE_PAST else null
    }

    private fun isIsoDate(value: String): Boolean {
        if (!ISO_DATE.matches(value)) return false
        val formatter = SimpleDateFormat("yyyy-MM-dd", Locale.ROOT).apply { isLenient = false }
        val parsed = runCatching { formatter.parse(value) }.getOrNull() ?: return false
        return formatter.format(parsed) == value
    }

    private fun isUrl(value: String): Boolean = runCatching {
        val uri = URI(value)
        uri.scheme in setOf("http", "https") && !uri.host.isNullOrBlank()
    }.getOrDefault(false)

    private fun isUuid(value: String): Boolean =
        UUID_SHAPE.matches(value) && runCatching { UUID.fromString(value) }.isSuccess
}
