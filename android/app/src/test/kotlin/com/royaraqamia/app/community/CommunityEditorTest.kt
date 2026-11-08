package com.royaraqamia.app.community

import android.content.Context
import androidx.test.core.app.ApplicationProvider
import com.royaraqamia.app.api.ApiClient
import com.royaraqamia.app.contracts.generated.CommunityIndexResponsePostsItem
import com.royaraqamia.app.contracts.generated.CommunityIndexResponsePostsItemStatus
import com.royaraqamia.app.net.HttpResponse
import com.royaraqamia.app.session.MemoryTokenStore
import com.royaraqamia.app.session.RefreshOutcome
import com.royaraqamia.app.session.Session
import com.royaraqamia.app.session.TokenPair
import com.royaraqamia.app.session.TokenRefresher
import com.royaraqamia.app.store.Identity
import com.royaraqamia.app.store.IdentityScopedStore
import com.royaraqamia.app.store.MemoryIdentityStorage
import com.royaraqamia.app.store.blogpress.BlogpressDatabase
import com.royaraqamia.app.store.blogpress.BlogpressRepository
import com.royaraqamia.app.store.blogpress.BlogpressStores
import com.royaraqamia.app.store.outbox.WriteClock
import com.royaraqamia.app.support.RecordingTransport
import java.util.Locale
import kotlinx.coroutines.runBlocking
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/**
 * The community editor's draft, from the feed's row to the page's PATCH (#925).
 *
 * JVM tests against real SQLite files (Robolectric), because the claims are about
 * rows on disk surviving a process: a draft typed with the radio off is the text
 * the next open paints, an unchanged draft queues nothing, and the write that
 * does leave is the same `PATCH /api/community/posts/{id}` the site's composer
 * sends.
 */
@RunWith(RobolectricTestRunner::class)
class CommunityEditorTest {
    private lateinit var context: Context
    private lateinit var databases: IdentityScopedStore<BlogpressStores>

    private val alice = Identity.User("alice-id")

    @Before
    fun setUp() {
        context = ApplicationProvider.getApplicationContext()
        databases = IdentityScopedStore { identity -> BlogpressStores.open(context, identity) }
    }

    @After
    fun tearDown() {
        databases.close()
        for (identity in listOf(alice, Identity.Guest)) {
            context.deleteDatabase(BlogpressDatabase.fileName(identity))
        }
    }

    @Test
    fun `opening the editor seeds the post the feed already read`() = runBlocking {
        val editor = repository()

        val draft = editor.open(post)

        assertEquals("first post", draft?.body)
    }

    @Test
    fun `a draft typed with the radio off survives a process kill`() = runBlocking {
        val before = repository()
        val draft = checkNotNull(before.open(post))

        before.save(draft.id, "draft typed offline")

        // The process dies: the connection goes, the file does not.
        databases.close()

        val after = repository()
        assertEquals(
            "the newest text is on disk",
            "draft typed offline",
            after.open(post)?.body,
        )
        assertEquals("and the write is still queued", 1, after.outboxStatus().pending)
    }

    @Test
    fun `an unchanged draft does not write`() = runBlocking {
        val editor = repository()
        val draft = checkNotNull(editor.open(post))

        editor.save(draft.id, draft.body)

        assertEquals("nothing to send", 0, editor.outboxStatus().pending)
    }

    @Test
    fun `a save is one PATCH through the route the page uses`() = runBlocking {
        val transport = RecordingTransport { HttpResponse(200, """{"message":"ok"}""") }
        val editor = repository(transport)
        val draft = checkNotNull(editor.open(post))

        editor.save(draft.id, "the edited post")
        editor.drain()

        val sent = transport.requests.single()
        assertEquals("PATCH", sent.method)
        assertTrue(sent.url, sent.url.endsWith("/api/community/posts/post-1"))
        assertTrue(sent.body.orEmpty(), sent.body.orEmpty().contains("the edited post"))
        assertTrue(
            "the write carries its logical time: ${sent.body}",
            sent.body.orEmpty().contains("\"updatedAt\""),
        )
    }

    private suspend fun repository(
        transport: RecordingTransport = RecordingTransport { HttpResponse(200, "{}") },
    ): CommunityEditorRepository =
        CommunityEditorRepository(
            BlogpressRepository(
                databases = databases,
                identity = { alice },
                client =
                    ApiClient(
                        "https://app.test",
                        Session(
                            MemoryTokenStore("refresh-1"),
                            TokenRefresher { RefreshOutcome.Refused },
                            MemoryIdentityStorage(alice),
                        ).also {
                            it.signIn(TokenPair("access-1", "refresh-1", "alice-id"))
                        },
                        transport,
                    ),
                clock = TestClock(),
                nowMillis = { 0L },
            )
        )

    /** One id per call and one advancing instant, so a replay keeps its order. */
    private class TestClock : WriteClock {
        private var counter = 0
        private var millis = 1_767_225_600_000L

        override fun uuid(): String {
            counter += 1
            return String.format(Locale.ROOT, "00000000-0000-7000-8000-%012d", counter)
        }

        override fun nowIso(): String {
            millis += 1_000
            return java.time.format.DateTimeFormatter.ofPattern(
                "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'",
                Locale.ROOT,
            )
                .withZone(java.time.ZoneOffset.UTC)
                .format(java.time.Instant.ofEpochMilli(millis))
        }

        override fun today(): String = "2026-01-01"
    }

    private companion object {
        val post =
            CommunityIndexResponsePostsItem(
                id = "post-1",
                author_id = "alice-id",
                slug = "hello",
                content = "first post",
                status = CommunityIndexResponsePostsItemStatus.PUBLISHED,
                cover_image = null,
                meta_title = null,
                meta_desc = null,
                published_at = "2026-01-01T00:00:00.000Z",
                publish_at = null,
                view_count = 0,
                featured = false,
                community_visible = true,
                reading_time_minutes = 1,
                created_at = "2026-01-01T00:00:00.000Z",
                updated_at = "2026-01-01T00:00:00.000Z",
            )
    }
}
