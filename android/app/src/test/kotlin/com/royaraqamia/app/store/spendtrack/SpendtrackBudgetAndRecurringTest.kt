package com.royaraqamia.app.store.spendtrack

import android.content.Context
import androidx.test.core.app.ApplicationProvider
import androidx.test.core.app.ApplicationProvider.getApplicationContext
import com.royaraqamia.app.api.ApiClient
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
import kotlinx.coroutines.runBlocking
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import java.util.Locale

/**
 * SpendTrack's budgets and recurring expenses, from the tap to the server (#653).
 *
 * The two rows that are keyed differently from an expense: a budget has no id of
 * its own — the server identifies it by `(month, category)` and the device must
 * replay against that pair — and a schedule carries the day of the month the
 * server materialises from.
 */
@RunWith(RobolectricTestRunner::class)
class SpendtrackBudgetAndRecurringTest {
    private lateinit var context: Context
    private lateinit var databases: IdentityScopedStore<SpendtrackStores>
    private val alice = Identity.User("alice-id")

    @Before
    fun setUp() {
        context = getApplicationContext()
        databases = IdentityScopedStore { identity -> SpendtrackStores.open(context, identity) }
    }

    @After
    fun tearDown() {
        databases.close()
        for (identity in listOf(alice, Identity.Guest)) {
            context.deleteDatabase(SpendtrackDatabase.fileName(identity))
        }
    }

    @Test
    fun `a budget is written on its month and drains to the pair the route updates`() = runBlocking {
        val transport = RecordingTransport { HttpResponse(200, "{}") }
        val repository = repository(transport)

        repository.setBudget("2026-01", 1500.0)

        assertEquals(1500.0, repository.budget("2026-01")!!.amount, 0.0)
        assertEquals(1, repository.outboxStatus().pending)

        repository.drain()

        val sent = transport.requests.single()
        assertEquals("PUT", sent.method)
        assertTrue(sent.url, sent.url.endsWith("/spendtrack/api/budget"))
        // No clientId: the server keys a budget on (month, category), which is
        // why the web drops it too.
        assertTrue(sent.body.orEmpty(), sent.body.orEmpty().contains("\"month\":\"2026-01\""))
        assertTrue(sent.body.orEmpty(), !sent.body.orEmpty().contains("clientId"))
    }

    @Test
    fun `a budget delete carries the pair in the query and the time in the body`() = runBlocking {
        val transport = RecordingTransport { HttpResponse(200, "{}") }
        val repository = repository(transport)
        repository.setBudget("2026-01", 1500.0)
        repository.drain()

        assertTrue(repository.deleteBudget("2026-01"))
        assertNull("the card goes back to unset", repository.budget("2026-01"))
        repository.drain()

        val sent = transport.requests.last()
        assertEquals("DELETE", sent.method)
        assertTrue(sent.url, sent.url.contains("/spendtrack/api/budget?month=2026-01"))
        assertTrue(sent.body.orEmpty(), sent.body.orEmpty().contains("updatedAt"))
    }

    @Test
    fun `a recurring expense replays to the endpoints the web replays to`() = runBlocking {
        val transport = RecordingTransport { HttpResponse(200, "{}") }
        val repository = repository(transport)

        val row =
            repository.createRecurring(
                amount = 89.0,
                categoryId = "cat-1",
                dayOfMonth = 5,
                startMonth = "2026-01",
                description = "اشتراك الإنترنت",
            )
        repository.updateRecurring(
            id = row.id,
            amount = 99.0,
            categoryId = "cat-1",
            dayOfMonth = 7,
            startMonth = "2026-01",
            description = null,
        )

        assertEquals(
            "the edited amount is what the list paints",
            99.0,
            repository.recurring().first { it.id == row.id }.amount,
            0.0,
        )

        repository.deleteRecurring(row.id)

        assertEquals("and a delete hides it", emptyList<String>(), repository.recurring().map { it.id })
        repository.drain()

        val sent = transport.requests.map { it.method to it.url.substringAfter("/spendtrack/api") }
        assertEquals(
            listOf(
                "POST" to "/recurring",
                "PATCH" to "/recurring/${row.id}",
                "DELETE" to "/recurring/${row.id}",
            ),
            sent,
        )
    }

    @Test
    fun `a pull writes the page's budgets and schedules, keyed the way the store keys them`() =
        runBlocking {
            val repository = repository(
                RecordingTransport { request ->
                    if (request.url.contains("/spendtrack/api/sync")) HttpResponse(200, SYNC_BODY)
                    else HttpResponse(200, """{"currency":"SAR"}""")
                }
            )

            assertTrue(repository.pull() is ApiResult.Success)

            val budget = repository.budget("2026-01")
            assertEquals("the month's own budget, not a category's", 1500.0, budget!!.amount, 0.0)
            assertEquals("2026-01#", budget.id)
            assertEquals(2, repository.budgets("2026-01").size)

            val schedule = repository.recurring().single()
            assertEquals(5L, schedule.dayOfMonth)
            assertEquals("اشتراك الإنترنت", schedule.description)
        }

    @Test
    fun `a queued budget is not clobbered by the page's copy`() = runBlocking {
        var syncBody = SYNC_BODY
        val repository = repository(
            RecordingTransport { request ->
                if (request.url.contains("/spendtrack/api/sync")) HttpResponse(200, syncBody)
                else HttpResponse(200, """{"currency":"SAR"}""")
            }
        )
        repository.pull()
        repository.setBudget("2026-01", 900.0)

        syncBody = SYNC_BODY
        repository.pull()

        assertEquals(
            "an unflushed budget keeps the device's number",
            900.0,
            repository.budget("2026-01")!!.amount,
            0.0,
        )
    }

    private suspend fun repository(
        transport: RecordingTransport,
        identity: () -> Identity = { alice },
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
        const val SYNC_BODY = """
        {
          "categories": [],
          "expenses": [],
          "budgets": [
            {"id":"b-1","month":"2026-01","amount":1500.0,"category_id":null,"clientId":null,"updatedAt":"2026-01-01T00:00:00.000Z","deletedAt":null},
            {"id":"b-2","month":"2026-01","amount":300.0,"category_id":"cat-1","clientId":null,"updatedAt":"2026-01-01T00:00:00.000Z","deletedAt":null}
          ],
          "recurring": [
            {"id":"r-1","amount":89.0,"category_id":"cat-1","description":"اشتراك الإنترنت","day_of_month":5,"start_month":"2026-01","active":true,"clientId":"r-1","updatedAt":"2026-01-01T00:00:00.000Z","deletedAt":null}
          ],
          "cursor": "cursor-1"
        }
        """
    }
}
