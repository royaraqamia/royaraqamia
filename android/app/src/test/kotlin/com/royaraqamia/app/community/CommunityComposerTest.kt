package com.royaraqamia.app.community

import com.royaraqamia.app.api.ApiClient
import com.royaraqamia.app.net.HttpResponse
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
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/**
 * The community composer's publish, from the field to the page's route (#924).
 *
 * The claims are the acceptance criteria: a publish is the same
 * `POST /api/blogpress/posts` with `status: 'published'` the page sends, and a
 * retry after an answer that never arrived reads the slug back instead of
 * creating a second post.
 */
@RunWith(RobolectricTestRunner::class)
class CommunityComposerTest {
    @Test
    fun `a publish sends the page's create-and-publish body`() = runBlocking {
        val transport = RecordingTransport { HttpResponse(200, """{"id":"p-9","slug":"post-abc12345"}""") }
        val composer = repository(transport)

        val result = composer.publish("post-abc12345", "  محتوى المنشور.  ")

        assertEquals(CommunityComposerResult.Published("post-abc12345"), result)
        val sent = transport.requests.single()
        assertEquals("POST", sent.method)
        assertTrue(sent.url, sent.url.endsWith("/api/blogpress/posts"))
        val body = sent.body.orEmpty()
        assertTrue(body, body.contains("\"slug\":\"post-abc12345\""))
        assertTrue(body, body.contains("\"content\":\"محتوى المنشور.\""))
        assertTrue(body, body.contains("\"status\":\"published\""))
        assertTrue(body, body.contains("\"meta_desc\":\"محتوى المنشور.\""))
        assertTrue(body, body.contains("\"cover_image\":\"\""))
    }

    @Test
    fun `a retry whose first answer was lost reads the slug back instead of duplicating`() = runBlocking {
        val transport =
            RecordingTransport { request ->
                when (request.method) {
                    "POST" -> HttpResponse(500, "فشل نشر المنشور")
                    "GET" -> HttpResponse(200, landedPost("post-abc12345"))
                    else -> HttpResponse(500, "")
                }
            }
        val composer = repository(transport)

        val result = composer.publish("post-abc12345", "محتوى المنشور.")

        assertEquals(CommunityComposerResult.Published("post-abc12345"), result)
        val reads = transport.requests.filter { it.method == "GET" }
        assertEquals("one read-back", 1, reads.size)
        assertTrue(reads.single().url, reads.single().url.endsWith("/api/community/post-abc12345"))
    }

    @Test
    fun `a refusal with no post under the slug stays a failure`() = runBlocking {
        val transport =
            RecordingTransport { request ->
                when (request.method) {
                    "POST" -> HttpResponse(403, "بلغت حدّ خطَّتك")
                    else -> HttpResponse(404, """{"message":"not found"}""")
                }
            }
        val composer = repository(transport)

        val result = composer.publish("post-abc12345", "محتوى المنشور.")

        assertTrue(result is CommunityComposerResult.Failed)
    }

    private suspend fun repository(transport: RecordingTransport): CommunityComposerRepository {
        val session =
            Session(
                MemoryTokenStore("refresh-1"),
                TokenRefresher { RefreshOutcome.Refused },
                MemoryIdentityStorage(),
            ).also { it.signIn(TokenPair("access-1", "refresh-1", "alice-id")) }
        val client = ApiClient("https://app.test", session, transport)
        return CommunityComposerRepository(client, CommunityPostRepository(client))
    }

    /** One published post as `GET /api/community/{slug}` answers it. */
    private fun landedPost(slug: String): String =
        """
        {
          "post": {
            "id": "p-9",
            "author_id": "alice-id",
            "slug": "$slug",
            "content": "محتوى المنشور.",
            "status": "published",
            "cover_image": null,
            "meta_title": null,
            "meta_desc": null,
            "published_at": "2026-01-01T00:00:00.000Z",
            "publish_at": null,
            "view_count": 0,
            "featured": false,
            "community_visible": true,
            "reading_time_minutes": 1,
            "created_at": "2026-01-01T00:00:00.000Z",
            "updated_at": "2026-01-01T00:00:00.000Z"
          },
          "postTags": []
        }
        """.trimIndent()
}
