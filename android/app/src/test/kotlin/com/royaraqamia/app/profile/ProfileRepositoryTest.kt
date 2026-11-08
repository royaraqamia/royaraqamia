package com.royaraqamia.app.profile

import com.royaraqamia.app.api.ApiClient
import com.royaraqamia.app.contracts.ApiError
import com.royaraqamia.app.net.HttpResponse
import com.royaraqamia.app.session.MemoryTokenStore
import com.royaraqamia.app.session.RefreshOutcome
import com.royaraqamia.app.session.Session
import com.royaraqamia.app.session.TokenRefresher
import com.royaraqamia.app.store.MemoryIdentityStorage
import com.royaraqamia.app.support.RecordingTransport
import java.io.IOException
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * One public profile, read on the page's route (#927).
 *
 * A profile is public, so the read carries no bearer; the handle is the route's
 * last segment, percent-encoded the way the site's own links spell it. The three
 * outcomes stay apart because they are three different screens: the profile, the
 * page's not-found, and the shared read-failure notice.
 */
class ProfileRepositoryTest {
    private val body =
        """
        {
          "member": {
            "id": "u-1",
            "username": "ahmad",
            "name": "أحمد",
            "avatar_url": null,
            "bio": "كاتب",
            "verified": true
          },
          "posts": [
            {
              "id": "p-1",
              "author_id": "u-1",
              "slug": "first-post",
              "content": "أول منشور.",
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
            }
          ],
          "nextCursor": null
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
        ProfileRepository(ApiClient("https://app.test", guest(), transport))

    @Test
    fun `a profile is live with its member and their posts`() {
        val transport = RecordingTransport { HttpResponse(200, body) }

        val result = runBlocking { repository(transport).profile("ahmad") }

        assertTrue(result is ProfileResult.Live)
        val profile = (result as ProfileResult.Live).profile
        assertEquals("ahmad", profile.member.username)
        assertEquals("first-post", profile.posts.single().slug)
    }

    @Test
    fun `the read sends no bearer, because a profile is public`() {
        val transport = RecordingTransport { HttpResponse(200, body) }

        runBlocking { repository(transport).profile("ahmad") }

        assertNull(transport.requests.single().bearer)
        assertEquals(
            "https://app.test/api/u/ahmad",
            transport.requests.single().url,
        )
    }

    @Test
    fun `an Arabic handle is percent-encoded in the route`() {
        val transport = RecordingTransport { HttpResponse(200, body) }

        runBlocking { repository(transport).profile("أحمد") }

        assertEquals(
            "https://app.test/api/u/%D8%A3%D8%AD%D9%85%D8%AF",
            transport.requests.single().url,
        )
    }

    @Test
    fun `a 404 is the page's not-found rather than a failed read`() {
        val transport = RecordingTransport { HttpResponse(404, """{"error":"الملف غير موجود."}""") }

        val result = runBlocking { repository(transport).profile("missing") }

        assertEquals(ProfileResult.NotFound, result)
    }

    @Test
    fun `an unreachable server is not the not-found`() {
        val transport = RecordingTransport { throw IOException("offline") }

        val result = runBlocking { repository(transport).profile("ahmad") }

        assertTrue(result is ProfileResult.Unavailable)
        assertTrue((result as ProfileResult.Unavailable).error is ApiError.Network)
    }
}
