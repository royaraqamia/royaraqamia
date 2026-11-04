package com.royaraqamia.app.store.leads

import com.royaraqamia.app.store.outbox.OutboxIntentRow
import com.royaraqamia.app.store.outbox.WriteRequest
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

/**
 * A queued lead intent as the request the web's Outbox sends (#929).
 *
 * The endpoints and bodies are the ones `frontend/api/leads/sync-transport.ts`
 * already drains to, so the server keeps one implementation per form and the
 * two clients cannot disagree about what a submission is. Every body carries
 * the client-minted `client_id`, which is what makes a replay idempotent: a
 * POST whose answer was lost returns the row it already created instead of a
 * second lead.
 */
object LeadsWriteTransport {
    /** The course the apply page offers; the schema's only value. */
    const val COURSE_SLUG = "build-digital-products"

    fun requestFor(intent: OutboxIntentRow): WriteRequest {
        val kind =
            LeadKind.ofIntentType(intent.type)
                ?: throw IllegalArgumentException("Unknown outbox intent type: ${intent.type}")
        return WriteRequest("POST", kind.endpoint, intent.payload)
    }

    /**
     * The body one form's answers become.
     *
     * The fields are the Zod schema's own names, and the two behaviours the
     * schemas rely on are kept here: every value is trimmed before it is sent
     * (the schemas call `.trim()`), and an optional field left blank is
     * **absent**, not an empty string the server would store as content.
     */
    fun encode(kind: LeadKind, draft: LeadDraft, clientId: String): String =
        buildJsonObject {
            when (kind) {
                LeadKind.Training -> {
                    put("course_slug", COURSE_SLUG)
                    put("full_name", draft.fullName.trim())
                    put("phone_whatsapp", draft.phone.trim())
                    draft.goal.trim().takeIf { it.isNotEmpty() }?.let { put("goal", it) }
                    put("cohort_id", draft.cohortId.trim())
                }
                LeadKind.ProjectRequest -> {
                    put("full_name", draft.fullName.trim())
                    put("phone_whatsapp", draft.phone.trim())
                    draft.email.trim().takeIf { it.isNotEmpty() }?.let { put("email", it) }
                    put("project_type", draft.projectType.trim())
                    put("description", draft.description.trim())
                    draft.budgetRange.trim().takeIf { it.isNotEmpty() }?.let {
                        put("budget_range", it)
                    }
                    draft.timeline.trim().takeIf { it.isNotEmpty() }?.let { put("timeline", it) }
                    draft.existingUrl.trim().takeIf { it.isNotEmpty() }?.let {
                        put("existing_url", it)
                    }
                }
                LeadKind.Retainer -> {
                    put("full_name", draft.fullName.trim())
                    put("phone_whatsapp", draft.phone.trim())
                    draft.email.trim().takeIf { it.isNotEmpty() }?.let { put("email", it) }
                    draft.company.trim().takeIf { it.isNotEmpty() }?.let { put("company", it) }
                    put("current_projects", draft.currentProjects.trim())
                    put("needs", draft.needs.trim())
                    draft.preferredStart.trim().takeIf { it.isNotEmpty() }?.let {
                        put("preferred_start", it)
                    }
                }
            }
            put("client_id", clientId)
        }.toString()
}
