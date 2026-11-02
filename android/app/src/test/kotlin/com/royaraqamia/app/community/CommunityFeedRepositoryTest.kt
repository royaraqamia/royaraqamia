package com.royaraqamia.app.community

import com.royaraqamia.app.api.ApiClient
import com.royaraqamia.app.contracts.ApiError
import com.royaraqamia.app.contracts.ApiResult
import com.royaraqamia.app.contracts.ContractCodec
import com.royaraqamia.app.net.HttpResponse
import com.royaraqamia.app.session.MemoryTokenStore
import com.royaraqamia.app.session.RefreshOutcome
import com.royaraqamia.app.session.Session
import com.royaraqamia.app.session.TokenRefresher
import com.royaraqamia.app.store.MemoryIdentityStorage
import com.royaraqamia.app.support.RecordingTransport
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import java.io.IOException

/**
 * The snapshot the matrix promises for `/community` (#658).
 *
 * The page the worker caches keeps painting its last rows with the radio off, so
 * the app must not be the client that says "no posts" where the browser shows the
 * feed it saw yesterday. What is asserted here is the order of the two facts: a
 * page the server answered is kept (and every page a member pages into joins it),
 * and only a read that failed may fall back to it — a kept page is never preferred
 * over a live one, and a file the contract can no longer read is not the feed.
 */
class CommunityFeedRepositoryTest {
    @get:Rule val temporary = TemporaryFolder()

    private val body =
        """
        {
          "posts": [
            {
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
            }
          ],
          "nextCursor": "cursor-1"
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

    private fun repository(transport: RecordingTransport, store: CommunityFeedSnapshotStore) =
        CommunityFeedRepository(ApiClient("https://app.test", guest(), transport), store)

    private fun store(): CommunityFeedSnapshotStore =
        CommunityFeedSnapshotStore(temporary.newFolder("community"))

    @Test
    fun `a page the server answered is live and kept for later`() {
        val transport = RecordingTransport { HttpResponse(200, body) }
        val snapshot = store()

        val result = runBlocking { repository(transport, snapshot).firstPage() }

        assertTrue(result is CommunityFeedResult.Live)
        val page = (result as CommunityFeedResult.Live).page
        assertEquals("first-post", page.posts.single().slug)
        assertEquals("أحمد", page.posts.single().author?.name)
        assertEquals("cursor-1", page.nextCursor)
        assertNotNull(snapshot.read())
    }

    @Test
    fun `the read sends no bearer, because the feed is public`() {
        val transport = RecordingTransport { HttpResponse(200, body) }

        runBlocking { repository(transport, store()).firstPage() }

        assertNull(transport.requests.single().bearer)
        assertEquals(
            "https://app.test/api/community/index",
            transport.requests.single().url,
        )
    }

    @Test
    fun `a read that failed falls back to the last page kept`() {
        val snapshot = store()
        snapshot.save(body)
        val transport = RecordingTransport { throw IOException("offline") }

        val result = runBlocking { repository(transport, snapshot).firstPage() }

        assertTrue(result is CommunityFeedResult.Snapshot)
        assertEquals("first-post", (result as CommunityFeedResult.Snapshot).page.posts.single().slug)
    }

    @Test
    fun `a read that failed with nothing kept has nothing to show`() {
        val transport = RecordingTransport { throw IOException("offline") }

        val result = runBlocking { repository(transport, store()).firstPage() }

        assertTrue(result is CommunityFeedResult.Unavailable)
        assertTrue((result as CommunityFeedResult.Unavailable).error is ApiError.Network)
    }

    @Test
    fun `a kept page the contract can no longer read is not the feed`() {
        val snapshot = store()
        snapshot.save("""{"posts":[{"id":"p-1"}]}""")
        val transport = RecordingTransport { HttpResponse(500, "{}") }

        val result = runBlocking { repository(transport, snapshot).firstPage() }

        assertTrue(result is CommunityFeedResult.Unavailable)
        assertTrue((result as CommunityFeedResult.Unavailable).error is ApiError.Server)
    }

    @Test
    fun `paging asks the same route with the cursor, and the merged page is kept`() {
        val transport = RecordingTransport { HttpResponse(200, body) }
        val snapshot = store()
        val repository = repository(transport, snapshot)
        val first = runBlocking { repository.firstPage() } as CommunityFeedResult.Live

        val next = runBlocking { repository.page("cursor-1") }

        assertEquals(
            "https://app.test/api/community/index?cursor=cursor-1",
            transport.requests.last().url,
        )
        assertTrue(next is ApiResult.Success)

        repository.remember(first.page.posts, "cursor-2")
        val kept = ContractCodec.decode<com.royaraqamia.app.contracts.generated.CommunityIndexResponse>(snapshot.read().orEmpty())
        assertTrue(kept is ApiResult.Success)
        val page = (kept as ApiResult.Success).value
        assertEquals("cursor-2", page.nextCursor)
    }

}
