package com.royaraqamia.app.store.linksnap

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
 * LinkSnap's writes, from the tap to the server (#654).
 *
 * JVM tests against real SQLite files (Robolectric), because the claims are
 * about rows on disk surviving a process: a queued intent is gone only when the
 * server accepted it, it belongs to the identity that made it, and a pull cannot
 * quietly overwrite it. A fake store would prove only that the fake behaves.
 *
 * The engine these exercise is HabitFlow's
 * ([com.royaraqamia.app.store.outbox.OutboxDrainer]); this suite is about
 * LinkSnap's *endpoints and payloads*, which is the part that differs.
 */
@RunWith(RobolectricTestRunner::class)
class LinksnapWritesTest {
    private lateinit var context: Context
    private lateinit var databases: IdentityScopedStore<LinksnapStores>

    private val alice = Identity.User("alice-id")
    private val bob = Identity.User("bob-id")
    private var who: Identity = alice

    @Before
    fun setUp() {
        context = ApplicationProvider.getApplicationContext()
        databases = IdentityScopedStore { identity -> LinksnapStores.open(context, identity) }
    }

    @After
    fun tearDown() {
        databases.close()
        for (identity in listOf(alice, bob, Identity.Guest)) {
            context.deleteDatabase(LinksnapDatabase.fileName(identity))
        }
    }

    @Test
    fun `a write queued before the process died drains after it`() = runBlocking {
        val before = repository(RecordingTransport { HttpResponse(200, "{}") })
        val row = before.createLink("https://example.com/very-long-path")

        // The process dies: the connection goes, the file does not.
        databases.close()

        val transport = RecordingTransport { HttpResponse(200, "{}") }
        val after = repository(transport)
        assertEquals("the queue survived", 1, after.outboxStatus().pending)
        assertEquals("the row survived too", listOf(row.clientId), after.links().map { it.clientId })

        val report = after.drain()

        assertEquals(1, report.replayed)
        assertEquals(0, report.pending)
        val sent = transport.requests.single()
        assertEquals("POST", sent.method)
        assertTrue(sent.url, sent.url.endsWith("/linksnap/api/shorten"))
        assertTrue(sent.body.orEmpty(), sent.body.orEmpty().contains("\"clientId\":\"${row.clientId}\""))
        assertTrue(sent.body.orEmpty(), sent.body.orEmpty().contains("\"customCode\":\"${row.code}\""))
    }

    @Test
    fun `a queued write is drained by the identity that made it, and by no other`() = runBlocking {
        val transport = RecordingTransport { HttpResponse(200, "{}") }
        val repository = repository(transport)
        repository.createLink("https://example.com/alice")

        who = bob
        assertEquals("bob's queue is empty", 0, repository.drain().replayed)
        assertEquals("and nothing was sent as bob", 0, transport.hits)
        assertEquals("bob's list does not show alice's row", 0, repository.links().size)

        who = alice
        assertEquals(1, repository.outboxStatus().pending)
        assertEquals(1, repository.drain().replayed)
    }

    @Test
    fun `every owned action replays to the endpoint the web replays to`() = runBlocking {
        val transport = RecordingTransport { HttpResponse(200, "{}") }
        val repository = repository(transport)
        val link = repository.createLink("https://example.com/one")
        repository.updateLink(
            link.clientId,
            LinksnapEdit(newCode = "another", originalUrl = "https://example.com/two"),
        )
        repository.deleteLink(link.clientId)
        repository.restoreLink(link.clientId)

        repository.drain()

        val sent = transport.requests.map { it.method to it.url.substringAfter("/linksnap/api") }
        assertEquals(
            listOf(
                "POST" to "/shorten",
                "PATCH" to "/links",
                "DELETE" to "/links?code=another",
                "PATCH" to "/links",
            ),
            sent,
        )
    }

    @Test
    fun `a delete is a tombstone the pull merges, not a missing row`() = runBlocking {
        val repository = repository(RecordingTransport { HttpResponse(200, "{}") })
        val row = repository.createLink("https://example.com/gone")
        assertTrue(repository.deleteLink(row.clientId))

        assertEquals("the list hides it", emptyList<String>(), repository.links().map { it.clientId })
        assertEquals(1, databases.forIdentity(alice).dao().allLinks().size)
        assertEquals("the create and the delete are both queued", 2, repository.outboxStatus().pending)
    }

    @Test
    fun `a pull writes the server's rows and its tombstones`() = runBlocking {
        var path = ""
        val repository = repository(
            RecordingTransport { request ->
                path = request.url
                HttpResponse(200, SYNC_BODY)
            }
        )

        assertTrue(repository.pull() is ApiResult.Success)

        assertEquals(listOf("client-1"), repository.links().map { it.clientId })
        assertEquals("a tombstone is kept so the next pull cannot resurrect it", 1, databases.forIdentity(alice).dao().allLinks().count { it.deletedAt != null })
        assertTrue(path, path.endsWith("/linksnap/api/links/sync"))
    }

    @Test
    fun `a pull leaves a row with a queued write alone`() = runBlocking {
        var syncBody = SYNC_BODY
        val repository = repository(
            RecordingTransport { request ->
                if (request.url.contains("/linksnap/api/links/sync")) HttpResponse(200, syncBody)
                else HttpResponse(200, "{}")
            }
        )
        repository.pull()

        repository.updateLink(
            "client-1",
            LinksnapEdit(originalUrl = "https://example.com/local"),
        )

        // A pull arrives with the server's older copy of the same row.
        syncBody = SYNC_BODY
        repository.pull()

        assertEquals(
            "an unflushed write is not clobbered by the server's copy",
            "https://example.com/local",
            repository.links().first { it.clientId == "client-1" }.originalUrl,
        )
    }

    @Test
    fun `a permanent refusal is kept, surfaced, and can be retried`() = runBlocking {
        var answer = 400
        val transport = RecordingTransport { HttpResponse(answer, """{"error":"not like this"}""") }
        val repository = repository(transport)
        repository.createLink("https://example.com/refused")

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
    fun `an unlock resolves against the server, and says so when it cannot`() = runBlocking {
        val online = repository(
            RecordingTransport { HttpResponse(200, """{"success":true,"originalUrl":"https://example.com/destination"}""") }
        )
        assertEquals(
            ApiResult.Success("https://example.com/destination"),
            online.unlock("abc123", "secret"),
        )

        val offline = repository(RecordingTransport { throw IOException("offline") })
        val failed = offline.unlock("abc123", "secret")
        assertTrue(failed is ApiResult.Failure)
        assertTrue((failed as ApiResult.Failure).error is ApiError.Network)
    }

    @Test
    fun `status follows the server's moderation and expiry order`() {
        val active = row("active", isBlocked = false, expiresAt = null)
        val expired = row("expired", isBlocked = false, expiresAt = "2025-01-01T00:00:00.000Z")
        val blocked = row("blocked", isBlocked = true, expiresAt = "2025-01-01T00:00:00.000Z")

        assertEquals("active", LinksnapStatus.of(active, NOW))
        assertEquals("expired", LinksnapStatus.of(expired, NOW))
        assertEquals("blocked", LinksnapStatus.of(blocked, NOW))
    }

    private fun row(label: String, isBlocked: Boolean, expiresAt: String?) =
        LinksnapLinkRow(
            clientId = label,
            code = label,
            originalUrl = "https://example.com/$label",
            createdAt = "2026-01-01T00:00:00.000Z",
            updatedAt = "2026-01-01T00:00:00.000Z",
            expiresAt = expiresAt,
            isBlocked = isBlocked,
            passwordProtected = false,
            deletedAt = null,
        )

    private suspend fun repository(
        transport: RecordingTransport,
        identity: () -> Identity = { who },
        nowMillis: () -> Long = { 0L },
    ): LinksnapRepository {
        val session =
            Session(
                MemoryTokenStore("refresh-1"),
                TokenRefresher { RefreshOutcome.Refused },
                MemoryIdentityStorage(alice),
            ).also { it.signIn(TokenPair("access-1", "refresh-1", "alice-id")) }

        return LinksnapRepository(
            databases = databases,
            identity = identity,
            client = ApiClient("https://app.test", session, transport),
            clock = TestClock(),
            nowMillis = nowMillis,
            random = { 0.5 },
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
        const val NOW = 1_767_225_600_000L

        /** One live link and one tombstone, written by another device. */
        const val SYNC_BODY = """
        {
          "links": [
            {"code":"abc123","originalUrl":"https://example.com/server","createdAt":"2026-01-01T00:00:00.000Z","updatedAt":"2026-01-01T00:00:00.000Z","isBlocked":false,"expiresAt":null,"passwordProtected":false,"clientId":"client-1","deletedAt":null},
            {"code":"gone99","originalUrl":"https://example.com/gone","createdAt":"2026-01-01T00:00:00.000Z","updatedAt":"2026-01-02T00:00:00.000Z","isBlocked":false,"expiresAt":null,"passwordProtected":false,"clientId":"client-2","deletedAt":"2026-01-02T00:00:00.000Z"}
          ]
        }
        """
    }
}
