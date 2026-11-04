package com.royaraqamia.app.store.leads

import com.royaraqamia.app.store.outbox.OutboxIntentRow
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * The body each lead form becomes, and the route it goes to (#929).
 *
 * The endpoints are the web's own drain targets, so a mismatch here is the one
 * thing that would make the app's queue invisible to the server that already
 * accepts the page's submissions. The field names are the Zod schemas' names.
 */
class LeadsWriteTransportTest {
    private val json = Json { ignoreUnknownKeys = true }

    @Test
    fun `every form replays to the page's endpoint`() {
        assertEquals(
            "/api/training/applications",
            LeadsWriteTransport.requestFor(intent(LeadKind.Training)).path,
        )
        assertEquals(
            "/api/project-requests",
            LeadsWriteTransport.requestFor(intent(LeadKind.ProjectRequest)).path,
        )
        assertEquals("/api/retainers", LeadsWriteTransport.requestFor(intent(LeadKind.Retainer)).path)
        assertEquals("POST", LeadsWriteTransport.requestFor(intent(LeadKind.Training)).method)
    }

    @Test
    fun `a training body carries the fixed course, the cohort and the client id`() {
        val body =
            LeadsWriteTransport.encode(
                LeadKind.Training,
                LeadDraft(
                    fullName = "  أحمد العلي  ",
                    phone = "0999999999",
                    cohortId = "11111111-1111-4111-8111-111111111111",
                ),
                clientId = "client-1",
            )
        val fields = json.parseToJsonElement(body).jsonObject

        assertEquals("build-digital-products", fields["course_slug"]?.jsonPrimitive?.content)
        assertEquals("أحمد العلي", fields["full_name"]?.jsonPrimitive?.content)
        assertEquals("11111111-1111-4111-8111-111111111111", fields["cohort_id"]?.jsonPrimitive?.content)
        assertEquals("client-1", fields["client_id"]?.jsonPrimitive?.content)
        assertFalse("a blank optional goal is absent, not empty", fields.containsKey("goal"))
    }

    @Test
    fun `a project body omits every optional answer the visitor left blank`() {
        val body =
            LeadsWriteTransport.encode(
                LeadKind.ProjectRequest,
                LeadDraft(
                    fullName = "أحمد العلي",
                    phone = "0999999999",
                    projectType = "website",
                    description = "مشروع تجريبي لاختبار الإرسال دون اتصال بالشبكة.",
                ),
                clientId = "client-2",
            )
        val fields = json.parseToJsonElement(body).jsonObject

        assertEquals("website", fields["project_type"]?.jsonPrimitive?.content)
        listOf("email", "budget_range", "timeline", "existing_url").forEach {
            assertFalse("$it is absent when blank", fields.containsKey(it))
        }
    }

    @Test
    fun `a retainer body carries the answers it has and omits the ones it does not`() {
        val body =
            LeadsWriteTransport.encode(
                LeadKind.Retainer,
                LeadDraft(
                    fullName = "محمد الحسن",
                    phone = "0999999999",
                    email = "m@example.com",
                    company = "شركة النور",
                    currentProjects = "متجر إلكتروني قائم على منصة سلة، وأحتاج إلى صيانته وتطويره.",
                    needs = "صيانة دورية وإصلاح الأعطال وإضافة ميزات جديدة إلى المتجر الحالي.",
                    preferredStart = "2026-11-05",
                ),
                clientId = "client-3",
            )
        val fields = json.parseToJsonElement(body).jsonObject

        assertEquals("m@example.com", fields["email"]?.jsonPrimitive?.content)
        assertEquals("شركة النور", fields["company"]?.jsonPrimitive?.content)
        assertEquals("2026-11-05", fields["preferred_start"]?.jsonPrimitive?.content)
        assertEquals("client-3", fields["client_id"]?.jsonPrimitive?.content)
        assertTrue(fields.containsKey("current_projects"))
        assertTrue(fields.containsKey("needs"))
    }

    private fun intent(kind: LeadKind) =
        OutboxIntentRow.pending(
            id = "intent-1",
            entity = "lead",
            type = kind.intentType,
            payload = "{}",
            createdAt = 0L,
        )
}
