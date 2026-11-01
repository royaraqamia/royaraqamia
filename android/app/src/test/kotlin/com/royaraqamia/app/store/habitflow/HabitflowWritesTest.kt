package com.royaraqamia.app.store.habitflow

import android.content.Context
import androidx.test.core.app.ApplicationProvider
import com.royaraqamia.app.api.ApiClient
import com.royaraqamia.app.net.HttpResponse
import com.royaraqamia.app.session.MemoryTokenStore
import com.royaraqamia.app.session.RefreshOutcome
import com.royaraqamia.app.session.Session
import com.royaraqamia.app.session.TokenPair
import com.royaraqamia.app.session.TokenRefresher
import com.royaraqamia.app.store.Identity
import com.royaraqamia.app.store.IdentityScopedStore
import com.royaraqamia.app.store.MemoryIdentityStorage
import com.royaraqamia.app.support.RecordingTransport
import kotlinx.coroutines.runBlocking
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import java.util.Locale

/**
 * A HabitFlow write, from the tap to the server (#650).
 *
 * JVM tests against real SQLite files (Robolectric), because the claims are
 * about rows on disk surviving a process: a queued intent is gone only when the
 * server accepted it, it belongs to the identity that made it, and a pull cannot
 * quietly overwrite it. A fake store would prove only that the fake behaves.
 */
@RunWith(RobolectricTestRunner::class)
class HabitflowWritesTest {
    private lateinit var context: Context
    private lateinit var databases: IdentityScopedStore<HabitStores>

    private val alice = Identity.User("alice-id")
    private val bob = Identity.User("bob-id")
    private var who: Identity = alice

    @Before
    fun setUp() {
        context = ApplicationProvider.getApplicationContext()
        databases = IdentityScopedStore { identity -> HabitStores.open(context, identity) }
    }

    @After
    fun tearDown() {
        databases.close()
        for (identity in listOf(alice, bob, Identity.Guest)) {
            context.deleteDatabase(HabitDatabase.fileName(identity))
        }
    }

    @Test
    fun `a write queued before the process died drains after it`() = runBlocking {
        val before = repository(RecordingTransport { HttpResponse(200, "{}") })
        val row = before.addHabit("Read Quran")

        // The process dies: the connection goes, the file does not.
        databases.close()

        val transport = RecordingTransport { HttpResponse(200, "{}") }
        val after = repository(transport)
        assertEquals("the queue survived", 1, after.outboxStatus().pending)

        val report = after.drain()

        assertEquals(1, report.replayed)
        assertEquals(0, report.pending)
        assertEquals("nothing else was sent", 1, transport.hits)
        val sent = transport.requests.single()
        assertEquals("POST", sent.method)
        assertTrue(sent.url, sent.url.endsWith("/habitflow/api/habits"))
        // The idempotency key: a replay of this create lands on the row it
        // already made, because the client mints the row's id (ADR-0029).
        assertTrue(sent.body.orEmpty(), sent.body.orEmpty().contains("\"clientId\":\"${row.id}\""))
    }

    @Test
    fun `a queued write is drained by the identity that made it, and by no other`() = runBlocking {
        val transport = RecordingTransport { HttpResponse(200, "{}") }
        val repository = repository(transport)
        repository.addHabit("Alice's habit")

        who = bob
        assertEquals("bob's queue is empty", 0, repository.drain().replayed)
        assertEquals("and nothing was sent as bob", 0, transport.hits)

        // A sign-out is the guest namespace: the queue is not bob's, and it is
        // not lost either.
        who = Identity.Guest
        assertEquals(0, repository.drain().replayed)
        assertEquals(0, transport.hits)

        who = alice
        assertEquals("alice's intent is still hers", 1, repository.outboxStatus().pending)
        assertEquals(1, repository.drain().replayed)
        assertEquals(1, transport.hits)
    }

    @Test
    fun `a pull leaves a row with a queued write alone`() = runBlocking {
        var syncBody = SYNC_BODY
        val repository = repository(
            RecordingTransport { request ->
                if (request.url.endsWith("/sync")) HttpResponse(200, syncBody) else HttpResponse(200, "{}")
            }
        )
        repository.pull()
        assertFalse(repository.logsToday()["h-1"]!!.completed)

        // The user records the habit offline: the local row and its intent commit.
        repository.toggleLog("h-1", repository.today(), true)

        // A pull arrives with the server's older copy of the same day.
        syncBody = SYNC_BODY
        repository.pull()

        assertTrue(
            "an unflushed write is not clobbered by the server's copy",
            repository.logsToday()["h-1"]!!.completed,
        )
    }

    @Test
    fun `once drained, the server's newer row wins the conflict`() = runBlocking {
        var syncBody = SYNC_BODY
        val repository = repository(
            RecordingTransport { request ->
                if (request.url.endsWith("/sync")) HttpResponse(200, syncBody) else HttpResponse(200, "{}")
            }
        )
        repository.pull()
        repository.toggleLog("h-1", repository.today(), true)
        repository.drain()

        // The other device recorded it as not done afterwards.
        syncBody = SYNC_BODY_NEWER
        repository.pull()

        assertFalse(
            "last write wins once nothing is queued",
            repository.logsToday()["h-1"]!!.completed,
        )
    }

    @Test
    fun `a permanent refusal is kept, surfaced, and can be retried`() = runBlocking {
        var answer = 400
        val transport = RecordingTransport { HttpResponse(answer, """{"error":"not like this"}""") }
        val repository = repository(transport)
        repository.addHabit("Read Quran")

        val refused = repository.drain()
        assertEquals(0, refused.replayed)
        assertEquals(1, refused.failed)
        assertEquals("the intent is kept, not dropped", 1, repository.outboxStatus().failed)

        answer = 200
        val retried = repository.retryFailed()

        assertEquals(1, retried.replayed)
        assertEquals(0, retried.failed)
        assertEquals(0, repository.outboxStatus().pending)
    }

    @Test
    fun `a transient failure backs off and is not retried before its time`() = runBlocking {
        var answer = 503
        val transport = RecordingTransport { HttpResponse(answer, "") }
        var millis = 0L
        val repository = repository(transport, nowMillis = { millis })
        repository.addHabit("Read Quran")

        val first = repository.drain()
        assertEquals(0, first.replayed)
        assertEquals(1, first.pending)

        val second = repository.drain()
        assertEquals("not due yet, so not attempted", 1, transport.hits)
        assertEquals(0, second.replayed)

        // Past the backoff the intent is due again.
        millis = 60_000
        answer = 200
        assertEquals(1, repository.drain().replayed)
    }

    @Test
    fun `a replay after a lost acknowledgement sends the same create again`() = runBlocking {
        var attempts = 0
        val transport = RecordingTransport { request ->
            if (request.url.endsWith("/sync")) {
                HttpResponse(200, """{"habits":[],"logs":[],"mode":"supabase"}""")
            } else {
                attempts += 1
                // The server took the first create; the answer never arrived.
                if (attempts == 1) HttpResponse(500, "") else HttpResponse(200, "{}")
            }
        }
        var millis = 0L
        val repository = repository(transport, nowMillis = { millis })
        repository.addHabit("Read Quran")

        repository.drain()
        millis = 60_000
        repository.drain()

        val writes = transport.requests.filter { it.method == "POST" }
        assertEquals(2, writes.size)
        // Same `clientId`, so the server's upsert lands on the row it already
        // made instead of creating a second one (ADR-0029).
        assertEquals("the replay is the same write", writes[0].body, writes[1].body)
        assertEquals(0, repository.outboxStatus().pending)
    }

    @Test
    fun `toggling twice queues two intents for one row`() = runBlocking {
        val repository = repository(RecordingTransport { HttpResponse(200, "{}") })

        repository.toggleLog("h-1", "2026-01-01", true)
        repository.toggleLog("h-1", "2026-01-01", false)

        assertEquals(2, repository.outboxStatus().pending)
        assertEquals("one row, keyed on the day", 1, repository.logsToday().size)
    }

    @Test
    fun `a deleted habit is a tombstone the pull merges, not a missing row`() = runBlocking {
        var syncBody = SYNC_BODY
        val repository = repository(
            RecordingTransport { request ->
                if (request.url.endsWith("/sync")) HttpResponse(200, syncBody) else HttpResponse(200, "{}")
            }
        )
        repository.pull()
        assertTrue(repository.deleteHabit("h-1"))

        val intent = databases.forIdentity(alice).dao().outbox().single()
        assertEquals("habit.delete", intent.type)
        assertEquals("the row is tombstoned", emptyList<String>(), repository.rows().map { it.id })
        assertEquals(1, databases.forIdentity(alice).dao().tombstones().size)

        syncBody = SYNC_BODY_NEWER
        repository.pull()
        // The queued delete keeps the tombstone even though the server's copy is
        // newer; the intent still owns this row.
        assertEquals(1, databases.forIdentity(alice).dao().tombstones().size)
    }

    private suspend fun repository(
        transport: RecordingTransport,
        identity: () -> Identity = { who },
        nowMillis: () -> Long = { 0L },
    ): HabitflowRepository {
        val session =
            Session(MemoryTokenStore("refresh-1"), TokenRefresher { RefreshOutcome.Refused }, MemoryIdentityStorage(alice))
                .also { it.signIn(TokenPair("access-1", "refresh-1", "alice-id")) }

        return HabitflowRepository(
            databases = databases,
            identity = identity,
            client = ApiClient("https://app.test", session, transport),
            clock = TestClock(),
            nowMillis = nowMillis,
            random = { 0.5 },
        )
    }

    /**
     * A clock the assertions can hold still: the id counter makes every minted
     * id distinct, and each ISO instant is one second after the last.
     */
    private class TestClock : WriteClock {
        private var counter = 0
        private var millis = 1_767_225_600_000L // 2026-01-01T00:00:00Z

        override fun uuid(): String {
            counter += 1
            return String.format(
                Locale.ROOT,
                "00000000-0000-7000-8000-%012d",
                counter,
            )
        }

        override fun nowIso(): String {
            millis += 1_000
            return ISO.format(java.time.Instant.ofEpochMilli(millis))
        }

        override fun today(): String = "2026-01-01"

        private val ISO: java.time.format.DateTimeFormatter =
            java.time.format.DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.ROOT)
                .withZone(java.time.ZoneOffset.UTC)
    }

    private companion object {
        /** One live habit and one not-done log, at a fixed instant. */
        const val SYNC_BODY = """
        {
          "habits": [
            {"id":"h-1","name":"Read Quran","frequency":"daily","createdAt":"2026-01-01T00:00:00.000Z","archived":false,"clientId":"h-1","updatedAt":"2026-01-01T00:00:00.000Z","deletedAt":null}
          ],
          "logs": [
            {"id":"l-1","habitId":"h-1","date":"2026-01-01","completed":false,"completedAt":null,"clientId":"l-1","updatedAt":"2026-01-01T00:00:00.000Z","deletedAt":null}
          ],
          "mode": "supabase"
        }
        """

        /** The same rows, written later by another device. */
        const val SYNC_BODY_NEWER = """
        {
          "habits": [
            {"id":"h-1","name":"Read Quran","frequency":"daily","createdAt":"2026-01-01T00:00:00.000Z","archived":false,"clientId":"h-1","updatedAt":"2026-01-02T00:00:00.000Z","deletedAt":null}
          ],
          "logs": [
            {"id":"l-1","habitId":"h-1","date":"2026-01-01","completed":false,"completedAt":null,"clientId":"l-1","updatedAt":"2026-01-02T00:00:00.000Z","deletedAt":null}
          ],
          "mode": "supabase"
        }
        """
    }
}
