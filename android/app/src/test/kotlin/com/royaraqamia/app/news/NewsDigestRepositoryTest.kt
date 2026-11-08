package com.royaraqamia.app.news

import com.royaraqamia.app.api.ApiClient
import com.royaraqamia.app.contracts.ApiError
import com.royaraqamia.app.net.HttpResponse
import com.royaraqamia.app.session.MemoryTokenStore
import com.royaraqamia.app.session.RefreshOutcome
import com.royaraqamia.app.session.Session
import com.royaraqamia.app.session.TokenPair
import com.royaraqamia.app.session.TokenRefresher
import com.royaraqamia.app.store.MemoryIdentityStorage
import com.royaraqamia.app.store.PublicSnapshotStore
import com.royaraqamia.app.support.RecordingTransport
import java.io.IOException
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder

/**
 * The digest read and the last-seen rows the public-surface rule promises (#926).
 *
 * The route, the query and the snapshot key are asserted as well as the rows:
 * a filter that lands on the wrong file would paint one day's digest under
 * another day's chip, which is exactly the stale lie the rule exists to prevent.
 */
class NewsDigestRepositoryTest {
    @get:Rule val temporary = TemporaryFolder()

    private val body =
        """
        {
          "board": {
            "day": {
              "digest": {
                "id": "digest-1",
                "date": "2026-11-08",
                "title": "ملخّص اليوم",
                "lede": "مقدّمة",
                "storyCount": 2,
                "model": "model-1",
                "publishedAt": "2026-11-08T06:00:00.000Z"
              },
              "stories": [
                {
                  "id": "story-1",
                  "position": 1,
                  "category": "tech",
                  "region": "arab",
                  "headline": "خبر تقني",
                  "summary": "ملخّص الخبر",
                  "whyItMatters": null,
                  "sourceId": "tech-daily",
                  "sourceName": "تقنية اليوم",
                  "sourceUrl": "https://example.com/story",
                  "sourcePublishedAt": null
                }
              ]
            },
            "dates": ["2026-11-08", "2026-11-07"],
            "search": null,
            "hasAnyDigest": true,
            "preferences": null,
            "personal": null,
            "cards": null
          }
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

    private fun session(signedIn: Boolean): Session =
        guest().also {
            if (signedIn) runBlocking { it.signIn(TokenPair("access-1", "refresh-1", "user-1")) }
        }

    private fun repository(
        transport: RecordingTransport,
        store: PublicSnapshotStore,
        signedIn: Boolean = false,
    ) = NewsDigestRepository(ApiClient("https://app.test", session(signedIn), transport), store)

    private fun store(): PublicSnapshotStore = PublicSnapshotStore(temporary.newFolder("public"))

    @Test
    fun `a guest reads the page's route with no bearer and keeps the shared digest`() {
        val transport = RecordingTransport { HttpResponse(200, body) }
        val snapshot = store()

        val result = runBlocking { repository(transport, snapshot).board() }

        assertTrue(result is NewsDigestResult.Live)
        val board = (result as NewsDigestResult.Live).board
        assertEquals("digest-1", board.day?.digest?.id)
        assertEquals(listOf("tech"), board.day?.stories?.map { it.category.name.lowercase() })

        val request = transport.requests.single()
        assertEquals("GET", request.method)
        assertEquals("https://app.test/api/news/board", request.url)
        assertNull("a guest's read carries no token", request.bearer)

        val kept = snapshot.read(NewsDigestRepository.SNAPSHOT_SURFACE)
        assertNotNull("the read is kept", kept)
        assertTrue("the kept body is the digest", kept!!.contains("\"digest-1\""))
    }

    @Test
    fun `a signed-in reader sends the session's bearer so the personal digest can answer`() {
        val transport = RecordingTransport { HttpResponse(200, body) }

        runBlocking { repository(transport, store(), signedIn = true).board() }

        assertEquals("Bearer access-1", transport.requests.single().bearer)
    }

    @Test
    fun `a date and the public view are the page's own query, in their own snapshot file`() {
        val transport = RecordingTransport { HttpResponse(200, body) }
        val snapshot = store()

        runBlocking {
            repository(transport, snapshot).board(date = "2026-11-08", view = NewsDigestRepository.VIEW_PUBLIC)
        }

        assertEquals(
            "https://app.test/api/news/board?date=2026-11-08&view=public",
            transport.requests.single().url,
        )
        assertNotNull(snapshot.read("news-2026-11-08-public"))
        assertNull("one day's file is not the latest day's", snapshot.read("news"))
    }

    @Test
    fun `a read that never reached the server falls back to the kept day`() {
        val kept = store().also { it.save("news-2026-11-08", body) }
        val transport = RecordingTransport { throw IOException("offline") }

        val result =
            runBlocking { repository(transport, kept).board(date = "2026-11-08") }

        assertTrue(result is NewsDigestResult.Snapshot)
    }

    @Test
    fun `with nothing kept there is nothing to show, and the failure is kept`() {
        val transport = RecordingTransport { throw IOException("offline") }

        val result = runBlocking { repository(transport, store()).board() }

        assertTrue(result is NewsDigestResult.Unavailable)
        assertTrue((result as NewsDigestResult.Unavailable).error is ApiError.Network)
        assertTrue(NewsDigestUiState.of(result).let { it is NewsDigestUiState.Unavailable && it.offline })
    }

    @Test
    fun `a refusal is not offline, and a snapshot is not a live board`() {
        assertEquals(
            NewsDigestUiState.Unavailable(offline = true),
            NewsDigestUiState.of(NewsDigestResult.Unavailable(ApiError.Network("offline"))),
        )
        val refused = NewsDigestUiState.of(NewsDigestResult.Unavailable(ApiError.Server(503, "boom")))
        assertTrue(refused is NewsDigestUiState.Unavailable)
        assertFalse((refused as NewsDigestUiState.Unavailable).offline)
    }

    @Test
    fun `a kept file the contract can no longer read is not a digest`() {
        val stale = store().also { it.save("news", """{"board":{}}""") }
        val transport = RecordingTransport { throw IOException("offline") }

        val result = runBlocking { repository(transport, stale).board() }

        assertTrue(result is NewsDigestResult.Unavailable)
    }

    @Test
    fun `the reader's own active digest is not written to a public snapshot`() {
        val personal =
            """
            {
              "board": {
                "day": {
                  "digest": {
                    "id": "mine-1", "date": "2026-11-08", "title": "t", "lede": "l",
                    "storyCount": 1, "model": "m", "publishedAt": "2026-11-08T06:00:00.000Z"
                  },
                  "stories": [
                    {
                      "id": "story-1", "position": 1, "category": "tech", "region": "arab",
                      "headline": "h", "summary": "s", "whyItMatters": null,
                      "sourceId": "mine", "sourceName": "n", "sourceUrl": "https://example.com",
                      "sourcePublishedAt": null
                    }
                  ]
                },
                "dates": ["2026-11-08"],
                "search": null,
                "hasAnyDigest": true,
                "preferences": null,
                "personal": { "available": true, "active": true, "ownSources": null },
                "cards": null
              }
            }
            """.trimIndent()
        val snapshot = store()
        val transport = RecordingTransport { HttpResponse(200, personal) }

        val result = runBlocking { repository(transport, snapshot).board() }

        assertTrue(result is NewsDigestResult.Live)
        assertNull("the reader's digest is not public rows", snapshot.read("news"))
    }

    @Test
    fun `the reader's own flags are stripped before the shared digest is kept`() {
        val readerScoped =
            """
            {
              "board": {
                "day": {
                  "digest": {
                    "id": "digest-1", "date": "2026-11-08", "title": "t", "lede": "l",
                    "storyCount": 1, "model": "m", "publishedAt": "2026-11-08T06:00:00.000Z"
                  },
                  "stories": [
                    {
                      "id": "story-1", "position": 1, "category": "tech", "region": "arab",
                      "headline": "h", "summary": "s", "whyItMatters": null,
                      "sourceId": "src", "sourceName": "n", "sourceUrl": "https://example.com",
                      "sourcePublishedAt": null
                    }
                  ]
                },
                "dates": ["2026-11-08"],
                "search": null,
                "hasAnyDigest": true,
                "preferences": { "selectedSources": 2, "filtered": true, "fellBack": false },
                "personal": { "available": true, "active": false, "ownSources": { "total": 2, "contributed": 0 } },
                "cards": { "cap": 5, "total": 1, "shown": 1, "visitor": false }
              }
            }
            """.trimIndent()
        val snapshot = store()
        val transport = RecordingTransport { HttpResponse(200, readerScoped) }

        runBlocking { repository(transport, snapshot).board() }

        val kept = snapshot.read("news")!!
        assertTrue("the shared rows are kept", kept.contains("\"story-1\""))
        assertFalse("no source selection is stored", kept.contains("\"selectedSources\""))
        assertFalse("no personal flag is stored", kept.contains("\"available\""))
        assertFalse("no card allowance is stored", kept.contains("\"cap\""))
    }

    @Test
    fun `a stripped snapshot decodes on the next offline read`() {
        val readerScoped =
            """
            {
              "board": {
                "day": {
                  "digest": {
                    "id": "digest-1", "date": "2026-11-08", "title": "t", "lede": "l",
                    "storyCount": 1, "model": "m", "publishedAt": "2026-11-08T06:00:00.000Z"
                  },
                  "stories": [
                    {
                      "id": "story-1", "position": 1, "category": "tech", "region": "arab",
                      "headline": "h", "summary": "s", "whyItMatters": null,
                      "sourceId": "src", "sourceName": "n", "sourceUrl": "https://example.com",
                      "sourcePublishedAt": null
                    }
                  ]
                },
                "dates": ["2026-11-08"],
                "search": null,
                "hasAnyDigest": true,
                "preferences": { "selectedSources": 2, "filtered": true, "fellBack": false },
                "personal": { "available": true, "active": false, "ownSources": null },
                "cards": { "cap": 5, "total": 1, "shown": 1, "visitor": false }
              }
            }
            """.trimIndent()
        val snapshot = store()
        runBlocking { repository(RecordingTransport { HttpResponse(200, readerScoped) }, snapshot).board() }

        val offline = RecordingTransport { throw IOException("offline") }
        val result = runBlocking { repository(offline, snapshot).board() }

        assertTrue("the kept body is readable after the reader's half is removed", result is NewsDigestResult.Snapshot)
        assertEquals("story-1", (result as NewsDigestResult.Snapshot).board.day?.stories?.single()?.id)
    }
}
