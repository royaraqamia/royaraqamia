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
 * The account news reads and writes, against the site's routes (#950).
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
          "selected": ["tech-daily"]
        }
        """.trimIndent()

    private val ownedBody =
        """
        {
          "success": true,
          "rows": [
            { "id": "feed-1", "kind": "source", "name": "مدوّنة",
              "url": "https://example.com/feed", "resolvedUrl": null, "state": "live",
              "failure": null, "note": null, "lastError": null,
              "createdAt": "2026-11-01T09:00:00.000Z" },
            { "id": "request-1", "kind": "request", "name": "t.me",
              "url": "https://t.me/example", "resolvedUrl": null, "state": "needs_review",
              "failure": "no-feed", "note": null, "lastError": null,
              "createdAt": "2026-11-02T09:00:00.000Z" }
          ],
          "limited": true,
          "cap": 3,
          "used": 2
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
                      "selected": []
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
                HttpResponse(200, """{"success":true,"selected":["tech-daily"]}""")
            }

        val result = runBlocking { repository(transport).saveSelection(listOf("tech-daily")) }

        val write = (result as ApiResult.Success).value
        assertEquals(setOf("tech-daily"), write.selected)
        val request = transport.requests.single()
        assertEquals("PUT", request.method)
        assertEquals("https://app.test/api/me/news-sources", request.url)
        assertTrue(request.body.orEmpty().contains("\"sourceIds\":[\"tech-daily\"]"))
    }

    @Test
    fun `the one list reads both a feed and a request from the page's route`() {
        val reads = RecordingTransport { HttpResponse(200, ownedBody) }

        val summary = (runBlocking { repository(reads).ownedSources() } as ApiResult.Success).value

        assertEquals(2, summary.used)
        assertEquals(3, summary.cap)
        assertEquals(listOf("source", "request"), summary.rows.map { it.kind })
        assertEquals(listOf("live", "needs_review"), summary.rows.map { it.state })
        assertEquals("no-feed", summary.rows.last().failure)
        assertEquals("https://app.test/api/me/news-private-sources", reads.requests.single().url)
    }

    @Test
    fun `removing a feed and cancelling a request use their own routes`() {
        val feed = RecordingTransport { HttpResponse(200, """{"success":true}""") }
        runBlocking { repository(feed).deletePrivateSource("feed-1") }
        assertEquals("DELETE", feed.requests.single().method)
        assertEquals(
            "https://app.test/api/me/news-private-sources/feed-1",
            feed.requests.single().url,
        )

        val request = RecordingTransport { HttpResponse(200, """{"success":true}""") }
        runBlocking { repository(request).deleteRequest("request-1") }
        assertEquals("DELETE", request.requests.single().method)
        assertEquals(
            "https://app.test/api/me/news-source-requests/request-1",
            request.requests.single().url,
        )
    }

    @Test
    fun `submitting a link is the page's POST, and the list is read back`() {
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

        val created = runBlocking { repository(writes).submitRequest("https://example.com") }

        assertTrue(created is ApiResult.Success)
        assertEquals("POST", writes.requests.single().method)
        assertEquals("https://app.test/api/me/news-source-requests", writes.requests.single().url)
        assertTrue(
            writes.requests.single().body.orEmpty().contains("\"url\":\"https://example.com\"")
        )
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
