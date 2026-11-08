package com.royaraqamia.app.community

import com.royaraqamia.app.api.ApiClient
import com.royaraqamia.app.contracts.ApiError
import com.royaraqamia.app.net.HttpResponse
import com.royaraqamia.app.session.MemoryTokenStore
import com.royaraqamia.app.session.RefreshOutcome
import com.royaraqamia.app.session.Session
import com.royaraqamia.app.session.TokenRefresher
import com.royaraqamia.app.store.MemoryIdentityStorage
import com.royaraqamia.app.support.RecordingTransport
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.IOException

/**
 * One post, read on the page's route (#922).
 *
 * A post is public, so the read carries no bearer; the slug is the route's last
 * segment, percent-encoded the way the site's own links spell it. The three
 * outcomes are kept apart because they are three different screens: the post, the
 * page's not-found, and the shared read-failure notice.
 */
class CommunityPostRepositoryTest {
    private val body =
        """
        {
          "post": {
            "id": "p-1",
            "author_id": "u-1",
            "slug": "first-post",
            "content": "## مرحبًا\n\nأول منشور.",
            "status": "published",
            "cover_image": null,
            "meta_title": null,
            "meta_desc": null,
            "published_at": "2026-01-01T00:00:00.000Z",
            "publish_at": null,
            "view_count": 3,
            "featured": false,
            "community_visible": true,
            "reading_time_minutes": 2,
            "created_at": "2026-01-01T00:00:00.000Z",
            "updated_at": "2026-01-01T00:00:00.000Z",
            "author": { "username": "ahmad", "name": "أحمد", "avatar_url": null }
          },
          "postTags": [{ "id": "t-1", "name": "تقنية", "slug": "tech" }]
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

    private fun repository(transport: RecordingTransport) =
        CommunityPostRepository(ApiClient("https://app.test", guest(), transport))

    @Test
    fun `a published post is live with its publisher and its tags`() {
        val transport = RecordingTransport { HttpResponse(200, body) }

        val result = runBlocking { repository(transport).post("first-post") }

        assertTrue(result is CommunityPostResult.Live)
        val response = (result as CommunityPostResult.Live).post
        assertEquals("first-post", response.post.slug)
        assertEquals("أحمد", response.post.author?.name)
        assertEquals("تقنية", response.postTags.single().name)
    }

    @Test
    fun `the read sends no bearer, because a post is public`() {
        val transport = RecordingTransport { HttpResponse(200, body) }

        runBlocking { repository(transport).post("first-post") }

        assertNull(transport.requests.single().bearer)
        assertEquals(
            "https://app.test/api/community/first-post",
            transport.requests.single().url,
        )
    }

    @Test
    fun `an Arabic slug is percent-encoded in the route`() {
        val transport = RecordingTransport { HttpResponse(200, body) }

        runBlocking { repository(transport).post("منشور") }

        assertEquals(
            "https://app.test/api/community/%D9%85%D9%86%D8%B4%D9%88%D8%B1",
            transport.requests.single().url,
        )
    }

    @Test
    fun `a 404 is the page's not-found rather than a failed read`() {
        val transport = RecordingTransport { HttpResponse(404, """{"error":"المنشور غير موجود."}""") }

        val result = runBlocking { repository(transport).post("missing-post") }

        assertEquals(CommunityPostResult.NotFound, result)
    }

    @Test
    fun `an unreachable server is not the not-found`() {
        val transport = RecordingTransport { throw IOException("offline") }

        val result = runBlocking { repository(transport).post("first-post") }

        assertTrue(result is CommunityPostResult.Unavailable)
        assertTrue((result as CommunityPostResult.Unavailable).error is ApiError.Network)
    }
}
