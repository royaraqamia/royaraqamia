package com.royaraqamia.app.store.blogpress

import android.content.Context
import androidx.test.core.app.ApplicationProvider
import com.royaraqamia.app.api.ApiClient
import com.royaraqamia.app.contracts.ApiError
import com.royaraqamia.app.contracts.ApiResult
import com.royaraqamia.app.net.HttpResponse
import com.royaraqamia.app.session.MemoryTokenStore
import com.royaraqamia.app.session.RefreshOutcome
import com.royaraqamia.app.session.Session
import com.royaraqamia.app.session.TokenPair
import com.royaraqamia.app.session.TokenRefresher
import com.royaraqamia.app.store.Identity
import com.royaraqamia.app.store.IdentityScopedStore
import com.royaraqamia.app.store.MemoryIdentityStorage
import com.royaraqamia.app.store.outbox.WriteClock
import com.royaraqamia.app.support.RecordingTransport
import java.io.IOException
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
 * BlogPress's writes, from the tap to the server (#952).
 *
 * JVM tests against real SQLite files (Robolectric), because the claims are
 * about rows on disk surviving a process: a queued delete is gone only when the
 * server accepted it, it belongs to the identity that made it, and a pull cannot
 * quietly overwrite it. A fake store would prove only that the fake behaves.
 *
 * The engine these exercise is HabitFlow's
 * ([com.royaraqamia.app.store.outbox.OutboxDrainer]); this suite is about
 * BlogPress's *endpoints and payloads*, which is the part that differs.
 */
@RunWith(RobolectricTestRunner::class)
class BlogpressWritesTest {
    private lateinit var context: Context
    private lateinit var databases: IdentityScopedStore<BlogpressStores>

    private val alice = Identity.User("alice-id")
    private val bob = Identity.User("bob-id")
    private var who: Identity = alice

    @Before
    fun setUp() {
        context = ApplicationProvider.getApplicationContext()
        databases = IdentityScopedStore { identity -> BlogpressStores.open(context, identity) }
    }

    @After
    fun tearDown() {
        databases.close()
        for (identity in listOf(alice, bob, Identity.Guest)) {
            context.deleteDatabase(BlogpressDatabase.fileName(identity))
        }
    }

    @Test
    fun `a delete queued before the process died drains after it`() = runBlocking {
        val before = repository(sync = SYNC_BODY)
        before.pull()
        val row = before.posts().single()

        assertTrue(before.deletePost(row.clientId))

        // The process dies: the connection goes, the file does not.
        databases.close()

        val transport = RecordingTransport { HttpResponse(200, "{}") }
        val after = repository(transport = transport, sync = SYNC_BODY)
        assertEquals("the queue survived", 1, after.outboxStatus().pending)
        assertEquals("the row is still hidden", emptyList<String>(), after.posts().map { it.id })

        val report = after.drain()

        assertEquals(1, report.replayed)
        assertEquals(0, report.pending)
        val sent = transport.requests.single()
        assertEquals("DELETE", sent.method)
        assertTrue(sent.url, sent.url.endsWith("/api/blogpress/posts/post-1"))
        assertTrue(sent.body.orEmpty(), sent.body.orEmpty().contains("\"updatedAt\""))
    }

    @Test
    fun `a queued write is drained by the identity that made it, and by no other`() = runBlocking {
        val transport = RecordingTransport { HttpResponse(200, "{}") }
        val repository = repository(transport = transport, sync = SYNC_BODY)
        repository.pull()
        repository.deletePost(repository.posts().single().clientId)

        who = bob
        assertEquals("bob's queue is empty", 0, repository.drain().replayed)
        assertEquals("and nothing was sent as bob", 0, transport.hits)
        assertEquals("bob's list does not show alice's row", 0, repository.posts().size)

        who = alice
        assertEquals(1, repository.outboxStatus().pending)
        assertEquals(1, repository.drain().replayed)
    }

    @Test
    fun `every owned action replays to the endpoint the web replays to`() = runBlocking {
        val transport = RecordingTransport { HttpResponse(200, "{}") }
        val repository = repository(transport = transport, sync = SYNC_BODY)
        repository.pull()
        val row = repository.posts().single()

        repository.deletePost(row.clientId)
        repository.restorePost(row.clientId)

        repository.drain()

        val sent = transport.requests.map { it.method to it.url.substringAfter("/api/blogpress") }
        assertEquals(
            listOf(
                "DELETE" to "/posts/post-1",
                "POST" to "/posts/restore",
            ),
            sent,
        )
        val restore = transport.requests[1].body.orEmpty()
        assertTrue(restore, restore.contains("\"slug\":\"hello\""))
        assertTrue("the optional tag list is omitted, not null: $restore", !restore.contains("tagIds"))
    }

    @Test
    fun `a delete is a tombstone the pull merges, not a missing row`() = runBlocking {
        val repository = repository(sync = SYNC_BODY)
        repository.pull()
        val row = repository.posts().single()
        assertTrue(repository.deletePost(row.clientId))

        assertEquals("the list hides it", emptyList<String>(), repository.posts().map { it.id })
        assertEquals(2, databases.forIdentity(alice).dao().allPosts().size)
        assertEquals("the delete is queued", 1, repository.outboxStatus().pending)
    }

    @Test
    fun `a pull writes the server's rows and its tombstones`() = runBlocking {
        var path = ""
        val repository = repository(
            transport = RecordingTransport { request ->
                path = request.url
                HttpResponse(200, SYNC_BODY)
            },
            sync = null,
        )

        val result = repository.pull()
        assertTrue(result.toString(), result is ApiResult.Success)

        assertEquals(listOf("post-1"), repository.posts().map { it.id })
        assertEquals(
            "a tombstone is kept so the next pull cannot resurrect it",
            1,
            databases.forIdentity(alice).dao().allPosts().count { it.deletedAt != null },
        )
        assertTrue(path, path.endsWith("/api/blogpress/sync"))
    }

    @Test
    fun `a pull leaves a row with a queued delete alone`() = runBlocking {
        val repository = repository(sync = SYNC_BODY)
        repository.pull()
        repository.deletePost(repository.posts().single().clientId)

        // A pull arrives with the server's live copy of the same row.
        repository.pull()

        assertEquals(
            "an unflushed delete is not resurrected by the server's copy",
            emptyList<String>(),
            repository.posts().map { it.id },
        )
    }

    @Test
    fun `a permanent refusal is kept, surfaced, and can be retried`() = runBlocking {
        var answer = 400
        val transport = RecordingTransport { HttpResponse(answer, """{"error":"not like this"}""") }
        val repository = repository(transport = transport, sync = SYNC_BODY)
        repository.pull()
        repository.deletePost(repository.posts().single().clientId)

        val refused = repository.drain()
        assertEquals(0, refused.replayed)
        assertEquals(1, refused.failed)
        assertEquals("the intent is kept, not dropped", 1, repository.outboxStatus().failed)

        answer = 200
        val retried = repository.retryFailed()

        assertEquals(1, retried.replayed)
        assertEquals(0, retried.failed)
    }

    @Test
    fun `the publication transitions are the page's endpoints`() = runBlocking {
        val transport = RecordingTransport { HttpResponse(200, """{"success":true}""") }
        val repository = repository(transport = transport, sync = SYNC_BODY)
        repository.pull()
        val row = repository.posts().single()

        repository.publishPost(row.id)
        repository.unpublishPost(row.id)
        repository.setFeatured(row.id, true)
        repository.duplicatePost(row.id)

        val sent = transport.requests.map { it.method to it.url.substringAfter("/api/blogpress") }
        assertEquals(
            listOf(
                "POST" to "/posts/post-1/publish",
                "POST" to "/posts/post-1/unpublish",
                "POST" to "/posts/post-1/featured",
                "POST" to "/posts/post-1/duplicate",
            ),
            sent,
        )
        assertTrue(transport.requests[2].body.orEmpty().contains("\"featured\":true"))
    }

    @Test
    fun `a new post reads the id the editor route opens`() = runBlocking {
        val repository = repository(
            transport = RecordingTransport { HttpResponse(200, """{"id":"new-post-id"}""") }
        )

        assertEquals(ApiResult.Success("new-post-id"), repository.createPost())
    }

    @Test
    fun `a pull against an unreachable server is a network failure`() = runBlocking {
        val repository = repository(transport = RecordingTransport { throw IOException("offline") }, sync = null)

        val answer = repository.pull()

        assertTrue(answer.toString(), answer is ApiResult.Failure)
        assertTrue((answer as ApiResult.Failure).error is ApiError.Network)
    }

    @Test
    fun `a draft typed with the radio off survives a process kill`() = runBlocking {
        val before = repository(sync = SYNC_BODY)
        before.pull()
        val row = before.editorPost("post-1")
        checkNotNull(row)

        before.saveDraft(row.id, fields("offline draft"))

        // The process dies: the connection goes, the file does not.
        databases.close()

        val after = repository(sync = null)
        assertEquals("the newest text is on disk", "offline draft", after.editorPost("post-1")?.content)
        assertEquals("and the write is still queued", 1, after.outboxStatus().pending)
    }

    @Test
    fun `a pull does not overwrite a queued newer draft`() = runBlocking {
        val repository = repository(sync = SYNC_BODY)
        repository.pull()
        val row = repository.editorPost("post-1")
        checkNotNull(row)

        repository.saveDraft(row.id, fields("first edit"))
        repository.saveDraft(row.id, fields("newer edit"))

        // The server's copy is the one the pull first wrote, an older `updatedAt`.
        val pulled = repository.pull()

        assertTrue(pulled.toString(), pulled is ApiResult.Success)
        assertEquals("a queued draft is not clobbered", "newer edit", repository.editorPost("post-1")?.content)
        assertEquals("both autosaves wait for the server", 2, repository.outboxStatus().pending)
    }

    @Test
    fun `a later drain sends the newest draft last, through the page's PATCH`() = runBlocking {
        val transport = RecordingTransport { HttpResponse(200, """{"message":"ok"}""") }
        val repository = repository(transport = transport, sync = SYNC_BODY)
        repository.pull()
        val row = repository.editorPost("post-1")
        checkNotNull(row)

        repository.saveDraft(row.id, fields("first edit"))
        repository.saveDraft(row.id, fields("newer edit"))

        val report = repository.drain()

        assertEquals(2, report.replayed)
        assertEquals(
            listOf("PATCH" to "/posts/post-1", "PATCH" to "/posts/post-1"),
            transport.requests.map { it.method to it.url.substringAfter("/api/blogpress") },
        )
        val bodies = transport.requests.map { it.body.orEmpty() }
        assertTrue("the first write is the first intent: ${bodies[0]}", bodies[0].contains("first edit"))
        assertTrue("and the newer draft is the last: ${bodies[1]}", bodies[1].contains("newer edit"))
        assertTrue("the write carries its logical time: ${bodies[1]}", bodies[1].contains("\"updatedAt\""))
    }

    private fun fields(content: String): BlogpressEditorFields =
        BlogpressEditorFields(
            slug = "hello",
            content = content,
            coverImage = "",
            metaTitle = "",
            metaDesc = "",
        )

    private suspend fun repository(
        transport: RecordingTransport = RecordingTransport { HttpResponse(200, "{}") },
        sync: String? = SYNC_BODY,
        identity: () -> Identity = { who },
    ): BlogpressRepository {
        val session =
            Session(
                MemoryTokenStore("refresh-1"),
                TokenRefresher { RefreshOutcome.Refused },
                MemoryIdentityStorage(alice),
            ).also { it.signIn(TokenPair("access-1", "refresh-1", "alice-id")) }

        return BlogpressRepository(
            databases = databases,
            identity = identity,
            client =
                ApiClient(
                    "https://app.test",
                    session,
                    RecordingTransport { request ->
                        if (sync != null && request.url.endsWith("/api/blogpress/sync")) {
                            HttpResponse(200, sync)
                        } else {
                            transport.send(
                                request.method,
                                request.url,
                                request.headers,
                                request.body,
                            )
                        }
                    },
                ),
            clock = TestClock(),
            nowMillis = { 0L },
        )
    }

    /** A clock the assertions can hold still: one id per call, one instant per call. */
    private class TestClock : WriteClock {
        private var counter = 0
        private var millis = 1_767_225_600_000L // 2026-01-01T00:00:00Z

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
        /** One live post and one tombstone, written by another device. */
        const val SYNC_BODY = """
        {
          "posts": [
            {
              "id":"post-1","author_id":"alice-id","client_id":null,"deleted_at":null,
              "slug":"hello","content":"first post","status":"draft",
              "cover_image":null,"meta_title":null,"meta_desc":null,
              "published_at":null,"publish_at":null,"view_count":0,
              "featured":false,"community_visible":true,"reading_time_minutes":1,
              "created_at":"2026-01-01T00:00:00.000Z","updated_at":"2026-01-01T00:00:00.000Z"
            },
            {
              "id":"post-2","author_id":"alice-id","client_id":null,"deleted_at":"2026-01-02T00:00:00.000Z",
              "slug":"gone","content":"gone post","status":"draft",
              "cover_image":null,"meta_title":null,"meta_desc":null,
              "published_at":null,"publish_at":null,"view_count":0,
              "featured":false,"community_visible":true,"reading_time_minutes":1,
              "created_at":"2026-01-01T00:00:00.000Z","updated_at":"2026-01-02T00:00:00.000Z"
            }
          ]
        }
        """
    }
}
