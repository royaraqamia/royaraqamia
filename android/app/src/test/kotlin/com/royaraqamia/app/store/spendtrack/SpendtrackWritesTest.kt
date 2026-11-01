package com.royaraqamia.app.store.spendtrack

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
import com.royaraqamia.app.store.outbox.WriteClock
import com.royaraqamia.app.support.RecordingTransport
import kotlinx.coroutines.runBlocking
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import java.util.Locale

/**
 * SpendTrack's writes, from the tap to the server (#653).
 *
 * JVM tests against real SQLite files (Robolectric), because the claims are
 * about rows on disk surviving a process: a queued intent is gone only when the
 * server accepted it, it belongs to the identity that made it, and a pull cannot
 * quietly overwrite it. A fake store would prove only that the fake behaves.
 *
 * The engine these exercise is HabitFlow's ([com.royaraqamia.app.store.outbox.OutboxDrainer]):
 * this suite is about SpendTrack's *endpoints and payloads*, which is the part
 * that differs between the two products.
 */
@RunWith(RobolectricTestRunner::class)
class SpendtrackWritesTest {
    private lateinit var context: Context
    private lateinit var databases: IdentityScopedStore<SpendtrackStores>

    private val alice = Identity.User("alice-id")
    private val bob = Identity.User("bob-id")
    private var who: Identity = alice

    @Before
    fun setUp() {
        context = ApplicationProvider.getApplicationContext()
        databases = IdentityScopedStore { identity -> SpendtrackStores.open(context, identity) }
    }

    @After
    fun tearDown() {
        databases.close()
        for (identity in listOf(alice, bob, Identity.Guest)) {
            context.deleteDatabase(SpendtrackDatabase.fileName(identity))
        }
    }

    @Test
    fun `a write queued before the process died drains after it`() = runBlocking {
        val before = repository(RecordingTransport { HttpResponse(200, "{}") })
        val row = before.createExpense(12.5, "cat-1", "2026-01-01", "غداء", null)

        // The process dies: the connection goes, the file does not.
        databases.close()

        val transport = RecordingTransport { HttpResponse(200, "{}") }
        val after = repository(transport)
        assertEquals("the queue survived", 1, after.outboxStatus().pending)
        assertEquals("the row survived too", listOf(row.id), after.expenses().map { it.id })

        val report = after.drain()

        assertEquals(1, report.replayed)
        assertEquals(0, report.pending)
        val sent = transport.requests.single()
        assertEquals("POST", sent.method)
        assertTrue(sent.url, sent.url.endsWith("/spendtrack/api/expenses"))
        // The idempotency key: a replay of this create lands on the row it
        // already made, because the client mints the row's id (ADR-0029).
        assertTrue(sent.body.orEmpty(), sent.body.orEmpty().contains("\"clientId\":\"${row.id}\""))
    }

    @Test
    fun `a queued write is drained by the identity that made it, and by no other`() = runBlocking {
        val transport = RecordingTransport { HttpResponse(200, "{}") }
        val repository = repository(transport)
        repository.createExpense(5.0, "cat-1", "2026-01-01", null, null)

        who = bob
        assertEquals("bob's queue is empty", 0, repository.drain().replayed)
        assertEquals("and nothing was sent as bob", 0, transport.hits)
        assertEquals("bob's list does not show alice's row", 0, repository.expenses().size)

        who = alice
        assertEquals(1, repository.outboxStatus().pending)
        assertEquals(1, repository.drain().replayed)
    }

    @Test
    fun `every owned action replays to the endpoint the web replays to`() = runBlocking {
        val transport = RecordingTransport { HttpResponse(200, "{}") }
        val repository = repository(transport)
        val expense = repository.createExpense(9.0, "cat-1", "2026-01-01", null, null)
        repository.updateExpense(expense.id, 10.0, "cat-1", "2026-01-02", "بقالة", null)
        val category = repository.createCategory("طعام", "#f00")
        repository.updateCategory(category.id, "طعامٌ", "#0f0")
        repository.deleteExpense(expense.id)
        repository.deleteCategory(category.id)

        repository.drain()

        val sent = transport.requests.map { it.method to it.url.substringAfter("/spendtrack/api") }
        assertEquals(
            listOf(
                "POST" to "/expenses",
                "PATCH" to "/expenses/${expense.id}",
                "POST" to "/categories",
                "PATCH" to "/categories/${category.id}",
                "DELETE" to "/expenses/${expense.id}",
                "DELETE" to "/categories/${category.id}",
            ),
            sent,
        )
    }

    @Test
    fun `a delete is a tombstone the pull merges, not a missing row`() = runBlocking {
        val repository = repository(RecordingTransport { HttpResponse(200, "{}") })
        val row = repository.createExpense(3.0, "cat-1", "2026-01-01", null, null)
        assertTrue(repository.deleteExpense(row.id))

        assertEquals("the list hides it", emptyList<String>(), repository.expenses().map { it.id })
        assertEquals(1, databases.forIdentity(alice).dao().allExpenses().size)
        assertEquals("the create and the delete are both queued", 2, repository.outboxStatus().pending)
    }

    @Test
    fun `a pull writes the server's rows, its tombstones and its cursor`() = runBlocking {
        var path = ""
        val repository = repository(
            RecordingTransport { request ->
                if (request.url.contains("/spendtrack/api/sync")) {
                    path = request.url
                    HttpResponse(200, SYNC_BODY)
                } else {
                    HttpResponse(200, """{"currency":"SAR"}""")
                }
            }
        )

        assertTrue(repository.pull() is com.royaraqamia.app.contracts.ApiResult.Success)

        assertEquals(listOf("e-1"), repository.expenses().map { it.id })
        assertEquals(listOf("c-1", "c-2"), repository.categories().map { it.id })
        assertEquals("the account's currency, for the next cold start", "SAR", repository.currency())
        assertTrue(path, path.endsWith("/spendtrack/api/sync"))

        // The next pull passes the cursor the page answered with, so it asks for
        // what changed rather than for the whole set again.
        repository.pull()
        assertTrue(path, path.contains("since=cursor-1"))
    }

    @Test
    fun `a pull leaves a row with a queued write alone`() = runBlocking {
        var syncBody = SYNC_BODY
        val repository = repository(
            RecordingTransport { request ->
                if (request.url.contains("/spendtrack/api/sync")) HttpResponse(200, syncBody)
                else HttpResponse(200, """{"currency":"SAR"}""")
            }
        )
        repository.pull()
        assertNull(repository.expenses().first { it.id == "e-1" }.deletedAt)

        // The user edits the expense offline: the local row and its intent commit.
        repository.updateExpense("e-1", 99.0, "c-1", "2026-01-01", "محلي", null)

        // A pull arrives with the server's older copy of the same row.
        syncBody = SYNC_BODY
        repository.pull()

        assertEquals(
            "an unflushed write is not clobbered by the server's copy",
            99.0,
            repository.expenses().first { it.id == "e-1" }.amount,
            0.0,
        )
    }

    @Test
    fun `once drained, the server's newer row wins the conflict`() = runBlocking {
        var syncBody = SYNC_BODY
        val repository = repository(
            RecordingTransport { request ->
                if (request.url.contains("/spendtrack/api/sync")) HttpResponse(200, syncBody)
                else HttpResponse(200, """{"currency":"SAR"}""")
            }
        )
        repository.pull()
        repository.updateExpense("e-1", 99.0, "c-1", "2026-01-01", "محلي", null)
        repository.drain()

        syncBody = SYNC_BODY_NEWER
        repository.pull()

        assertEquals(
            "last write wins once nothing is queued",
            42.0,
            repository.expenses().first { it.id == "e-1" }.amount,
            0.0,
        )
    }

    @Test
    fun `a permanent refusal is kept, surfaced, and can be retried`() = runBlocking {
        var answer = 400
        val transport = RecordingTransport { HttpResponse(answer, """{"error":"not like this"}""") }
        val repository = repository(transport)
        repository.createExpense(1.0, "c-1", "2026-01-01", null, null)

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
    fun `a default category is not editable and not deletable here`() = runBlocking {
        val repository = repository(
            RecordingTransport { request ->
                if (request.url.contains("/spendtrack/api/sync")) HttpResponse(200, SYNC_BODY)
                else HttpResponse(200, """{"currency":"SAR"}""")
            }
        )
        repository.pull()

        assertNull("c-2 has no owner", repository.updateCategory("c-2", "x", "#000"))
        assertFalse(repository.deleteCategory("c-2"))
        assertEquals("and nothing was queued for it", 0, repository.outboxStatus().pending)
    }

    private suspend fun repository(
        transport: RecordingTransport,
        identity: () -> Identity = { who },
        nowMillis: () -> Long = { 0L },
    ): SpendtrackRepository {
        val session =
            Session(
                MemoryTokenStore("refresh-1"),
                TokenRefresher { RefreshOutcome.Refused },
                MemoryIdentityStorage(alice),
            ).also { it.signIn(TokenPair("access-1", "refresh-1", "alice-id")) }

        return SpendtrackRepository(
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
        /** One live expense, one owned category and one shared default, at a fixed instant. */
        const val SYNC_BODY = """
        {
          "categories": [
            {"id":"c-1","user_id":"alice-id","name":"طعام","colorHex":"#f00","created_at":"2026-01-01T00:00:00.000Z","clientId":"c-1","updatedAt":"2026-01-01T00:00:00.000Z","deletedAt":null},
            {"id":"c-2","user_id":null,"name":"مواصلات","colorHex":"#00f","created_at":"2026-01-01T00:00:00.000Z","clientId":null,"updatedAt":"2026-01-01T00:00:00.000Z","deletedAt":null}
          ],
          "expenses": [
            {"id":"e-1","user_id":"alice-id","category_id":"c-1","amount":42.0,"description":"غداء","date":"2026-01-01","created_at":"2026-01-01T00:00:00.000Z","currency":null,"clientId":"e-1","updatedAt":"2026-01-01T00:00:00.000Z","deletedAt":null}
          ],
          "budgets": [],
          "recurring": [],
          "cursor": "cursor-1"
        }
        """

        /** The same expense, written later by another device. */
        const val SYNC_BODY_NEWER = """
        {
          "categories": [],
          "expenses": [
            {"id":"e-1","user_id":"alice-id","category_id":"c-1","amount":42.0,"description":"غداء","date":"2026-01-01","created_at":"2026-01-01T00:00:00.000Z","currency":null,"clientId":"e-1","updatedAt":"2026-01-02T00:00:00.000Z","deletedAt":null}
          ],
          "budgets": [],
          "recurring": [],
          "cursor": "cursor-2"
        }
        """
    }
}
