package com.royaraqamia.app.consultation

import com.royaraqamia.app.api.ApiClient
import com.royaraqamia.app.contracts.ApiResult
import com.royaraqamia.app.net.HttpResponse
import com.royaraqamia.app.session.MemoryTokenStore
import com.royaraqamia.app.session.RefreshOutcome
import com.royaraqamia.app.session.Session
import com.royaraqamia.app.session.TokenRefresher
import com.royaraqamia.app.store.MemoryIdentityStorage
import com.royaraqamia.app.support.RecordingTransport
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Consultation booking's one seam (#930).
 *
 * The two reads are the page's public routes, and the write is the same route the
 * page posts to. What matters here is the rule the surface exists for: the write
 * is never queued, so no radio means no request at all, and a slot taken between
 * the read and the write is its own outcome rather than a generic failure.
 */
class ConsultationRepositoryTest {
    private val packagesBody =
        """
        {
          "packages": [
            {
              "id": "p-1",
              "name": "جلسة واحدة",
              "description": null,
              "price_usd": 25,
              "duration_minutes": 60,
              "sessions_count": 1,
              "is_active": true,
              "sort_order": 0
            }
          ]
        }
        """.trimIndent()

    private val slotsBody =
        """
        {
          "slots": [
            {
              "id": "s-1",
              "starts_at": "2026-08-26T12:00:00Z",
              "ends_at": "2026-08-26T13:00:00Z"
            }
          ]
        }
        """.trimIndent()

    private fun guest(): Session =
        Session(
            MemoryTokenStore(),
            object : TokenRefresher {
                override suspend fun refresh(refreshToken: String) = RefreshOutcome.Refused
            },
            MemoryIdentityStorage(),
        )

    private fun repository(
        transport: RecordingTransport,
        online: () -> Boolean = { true },
    ) = ConsultationRepository(ApiClient("https://app.test", guest(), transport), online)

    private fun draft() =
        ConsultationDraft(
            packageId = "p-1",
            slotIds = listOf("s-1"),
            fullName = "  أحمد  ",
            phone = " +963968478904 ",
            topic = "أريد مراجعة خطتي لمشروع رقمي صغير.",
        )

    @Test
    fun `the packages read is the page's public route`() {
        val transport = RecordingTransport { HttpResponse(200, packagesBody) }

        val result = runBlocking { repository(transport).packages() }

        assertTrue(result is ApiResult.Success)
        assertEquals("p-1", (result as ApiResult.Success).value.single().id)
        val request = transport.requests.single()
        assertEquals("GET", request.method)
        assertEquals("https://app.test/api/consultation/packages", request.url)
        assertNull("a public read carries no token", request.bearer)
    }

    @Test
    fun `the slots read is the page's public route`() {
        val transport = RecordingTransport { HttpResponse(200, slotsBody) }

        val result = runBlocking { repository(transport).slots() }

        assertTrue(result is ApiResult.Success)
        assertEquals("s-1", (result as ApiResult.Success).value.single().id)
        assertEquals(
            "https://app.test/api/consultation/slots",
            transport.requests.single().url,
        )
    }

    @Test
    fun `a booking posts the page's own body to the page's own route`() {
        val transport =
            RecordingTransport {
                HttpResponse(
                    200,
                    """{"success":true,"bookingId":"b-1","referenceCode":"CONS-2026-A7K2M9QX"}""",
                )
            }

        val result = runBlocking { repository(transport).book(draft()) }

        assertEquals(BookingAttempt.Confirmed("CONS-2026-A7K2M9QX"), result)
        val request = transport.requests.single()
        assertEquals("POST", request.method)
        assertEquals("https://app.test/api/consultation/bookings", request.url)
        assertNull("booking is public on the page too", request.bearer)

        val body = Json.parseToJsonElement(request.body.orEmpty()).jsonObject
        assertEquals("p-1", body.getValue("package_id").jsonPrimitive.content)
        assertEquals(
            "s-1",
            body.getValue("slot_ids").jsonArray.single().jsonPrimitive.content,
        )
        assertEquals("أحمد", body.getValue("full_name").jsonPrimitive.content)
        assertEquals("+963968478904", body.getValue("phone_whatsapp").jsonPrimitive.content)
        assertEquals(
            "أريد مراجعة خطتي لمشروع رقمي صغير.",
            body.getValue("topic_description").jsonPrimitive.content,
        )
    }

    @Test
    fun `a slot taken between the read and the write is its own answer`() {
        val transport =
            RecordingTransport {
                HttpResponse(
                    409,
                    """{"success":false,"error":"نأسف، سبقك شخص آخر إلى أحد هذه المواعيد. اختر مواعيد جديدة."}""",
                )
            }

        val result = runBlocking { repository(transport).book(draft()) }

        assertEquals(
            BookingAttempt.Taken("نأسف، سبقك شخص آخر إلى أحد هذه المواعيد. اختر مواعيد جديدة."),
            result,
        )
    }

    @Test
    fun `a refusal keeps the server's sentence`() {
        val transport =
            RecordingTransport {
                HttpResponse(400, """{"success":false,"error":"تحقق من الحقول المدخلة."}""")
            }

        val result = runBlocking { repository(transport).book(draft()) }

        assertEquals(BookingAttempt.Refused("تحقق من الحقول المدخلة."), result)
    }

    @Test
    fun `with no radio the write is never sent`() {
        val transport = RecordingTransport { HttpResponse(200, slotsBody) }

        val result = runBlocking { repository(transport, online = { false }).book(draft()) }

        assertEquals(BookingAttempt.Offline, result)
        assertEquals("no request left the device", 0, transport.hits)
    }

    @Test
    fun `a body the contract cannot read is a refusal, not a crash`() {
        val transport = RecordingTransport { HttpResponse(200, """{"hello":"world"}""") }

        val result = runBlocking { repository(transport).book(draft()) }

        assertEquals(BookingAttempt.Refused(ConsultationCopy.GENERIC_ERROR), result)
    }
}
