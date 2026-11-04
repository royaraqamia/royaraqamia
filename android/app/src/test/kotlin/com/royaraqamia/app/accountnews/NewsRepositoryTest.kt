package com.royaraqamia.app.accountnews

import com.royaraqamia.app.api.ApiClient
import com.royaraqamia.app.contracts.ApiError
import com.royaraqamia.app.contracts.ApiResult
import com.royaraqamia.app.net.HttpResponse
import com.royaraqamia.app.net.Transport
import com.royaraqamia.app.session.MemoryTokenStore
import com.royaraqamia.app.session.RefreshOutcome
import com.royaraqamia.app.session.Session
import com.royaraqamia.app.session.TokenPair
import com.royaraqamia.app.session.TokenRefresher
import com.royaraqamia.app.store.MemoryIdentityStorage
import com.royaraqamia.app.support.RecordingTransport
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * The account news reads and writes, against the site's four routes (#950).
 *
 * The paths and verbs are asserted as well as the bodies: they are the part a
 * rename on the site breaks silently, and a write made in the app has to be the
 * same write the page makes for the page to see it afterwards (ADR-0098).
 */
class NewsRepositoryTest {
    private val selectionBody =
        """
        {
          "success": true,
          "sources": [
            { "id": "tech-daily", "name": "تقنية اليوم", "category": "tech", "region": "arab", "tier": 1 }
          ],
          "selected": ["tech-daily"],
          "personalEnabled": true
        }
        """.trimIndent()

    private val privateBody =
        """
        {
          "success": true,
          "sources": [
            { "id": "feed-1", "name": "مدوّنة", "url": "https://example.com/feed",
              "kind": "feed", "category": "tech", "region": "world", "status": "ready",
              "failureCount": 0, "lastError": null, "lastCheckedAt": null,
              "createdAt": "2026-11-01T09:00:00.000Z" }
          ],
          "limited": true,
          "cap": 3,
          "used": 1,
          "personalEnabled": false
        }
        """.trimIndent()

    private val requestsBody =
        """
        {
          "success": true,
          "requests": [
            { "id": "request-1", "url": "https://example.com", "name": "مصدر",
              "status": "needs_review", "kind": null, "resolvedUrl": null,
              "failure": "no-feed", "failureDetail": "no feed", "attempts": 1,
              "resolvedAt": null, "category": null, "region": null, "tier": null,
              "note": null, "createdAt": "2026-11-01T09:00:00.000Z",
              "reviewedAt": null, "sourceId": null, "userSourceId": null }
          ]
        }
        """.trimIndent()

    private fun repository(transport: Transport): NewsRepository {
        val session =
            runBlocking {
                Session(
                        MemoryTokenStore("refresh-1"),
                        TokenRefresher { RefreshOutcome.Refused },
                        MemoryIdentityStorage(),
                    )
                    .also { it.signIn(TokenPair("access-1", "refresh-1", "user-1")) }
            }
        return NewsRepository(ApiClient("https://app.test", session, transport))
    }

    @Test
    fun `the checklist reads the page's route and maps its rows`() {
        val transport = RecordingTransport { HttpResponse(200, selectionBody) }

        val result = runBlocking { repository(transport).selection() }

        val selection = (result as ApiResult.Success).value
        assertEquals(listOf("tech-daily"), selection.sources.map { it.id })
        assertEquals("tech", selection.sources.single().category)
        assertEquals("arab", selection.sources.single().region)
        assertEquals(setOf("tech-daily"), selection.selected)
        assertEquals(true, selection.personalEnabled)
        assertEquals("GET", transport.requests.single().method)
        assertEquals("https://app.test/api/me/news-sources", transport.requests.single().url)
    }

    @Test
    fun `an empty kept list means every source, as the page reads it`() {
        val transport =
            RecordingTransport {
                HttpResponse(
                    200,
                    """
                    {
                      "success": true,
                      "sources": [
                        { "id": "tech-daily", "name": "تقنية اليوم", "category": "tech", "region": "arab", "tier": 1 }
                      ],
                      "selected": [],
                      "personalEnabled": false
                    }
                    """.trimIndent(),
                )
            }

        val selection = (runBlocking { repository(transport).selection() } as ApiResult.Success).value

        assertEquals(setOf("tech-daily"), selection.selected)
    }

    @Test
    fun `saving the checklist is the page's PUT with the kept ids`() {
        val transport =
            RecordingTransport {
                HttpResponse(200, """{"success":true,"selected":["tech-daily"],"personalEnabled":true}""")
            }

        val result = runBlocking { repository(transport).saveSelection(listOf("tech-daily"), true) }

        val write = (result as ApiResult.Success).value
        assertEquals(setOf("tech-daily"), write.selected)
        assertEquals(true, write.personalEnabled)
        val request = transport.requests.single()
        assertEquals("PUT", request.method)
        assertEquals("https://app.test/api/me/news-sources", request.url)
        assertTrue(request.body.orEmpty().contains("\"sourceIds\":[\"tech-daily\"]"))
        assertTrue(request.body.orEmpty().contains("\"personalEnabled\":true"))
    }

    @Test
    fun `the private list, its switch and its removal use the page's routes`() {
        val reads = RecordingTransport { HttpResponse(200, privateBody) }

        val summary = (runBlocking { repository(reads).privateSources() } as ApiResult.Success).value
        assertEquals(1, summary.used)
        assertEquals(3, summary.cap)
        assertEquals("ready", summary.sources.single().status)
        assertEquals("https://app.test/api/me/news-private-sources", reads.requests.single().url)

        val patch = RecordingTransport { HttpResponse(200, privateBody) }
        runBlocking { repository(patch).enablePersonalDigest() }
        assertEquals("PATCH", patch.requests.single().method)
        assertEquals("https://app.test/api/me/news-private-sources", patch.requests.single().url)

        val delete = RecordingTransport { HttpResponse(200, """{"success":true}""") }
        runBlocking { repository(delete).deletePrivateSource("feed-1") }
        assertEquals("DELETE", delete.requests.single().method)
        assertEquals(
            "https://app.test/api/me/news-private-sources/feed-1",
            delete.requests.single().url,
        )
    }

    @Test
    fun `requests are read and submitted on the page's route`() {
        val reads = RecordingTransport { HttpResponse(200, requestsBody) }

        val rows = (runBlocking { repository(reads).requests() } as ApiResult.Success).value
        assertEquals("needs_review", rows.single().status)
        assertEquals("no_feed", rows.single().failure)
        assertEquals("GET", reads.requests.single().method)
        assertEquals("https://app.test/api/me/news-source-requests", reads.requests.single().url)

        val writes =
            RecordingTransport {
                HttpResponse(
                    202,
                    """
                    {"success":true,"request":{"id":"request-2","url":"https://example.com",
                    "name":"مصدر","status":"resolving","kind":null,"resolvedUrl":null,
                    "failure":null,"failureDetail":null,"attempts":0,"resolvedAt":null,
                    "category":null,"region":null,"tier":null,"note":null,
                    "createdAt":"2026-11-02T09:00:00.000Z","reviewedAt":null,
                    "sourceId":null,"userSourceId":null}}
                    """.trimIndent(),
                )
            }
        val created =
            (runBlocking { repository(writes).submitRequest("مصدر", "https://example.com") }
                as ApiResult.Success)
                .value
        assertEquals("resolving", created.status)
        assertEquals("POST", writes.requests.single().method)
        assertTrue(writes.requests.single().body.orEmpty().contains("\"name\":\"مصدر\""))
    }

    @Test
    fun `a refused write keeps the server's sentence`() {
        val error =
            NewsFailure.message(
                ApiError.Server(409, """{"success":false,"error":"هذا المصدر موجود بالفعل."}"""),
                AccountNewsRequestCopy.SEND_FAILED,
            )

        assertEquals("هذا المصدر موجود بالفعل.", error)
        assertEquals(
            AccountNewsRequestCopy.SEND_FAILED,
            NewsFailure.message(ApiError.Network("no radio"), AccountNewsRequestCopy.SEND_FAILED),
        )
    }
}
