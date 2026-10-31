package com.royaraqamia.app.store.habitflow

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
import com.royaraqamia.app.support.RecordingTransport
import kotlinx.coroutines.runBlocking
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/**
 * HabitFlow's store (#768): what a pull writes, what a read answers, and what the
 * identity partition keeps apart.
 *
 * These are JVM tests against a real SQLite database (Robolectric), not a fake
 * store: the claims the ticket makes are about rows on disk surviving a launch
 * with no radio, and a fake would prove only that the fake behaves.
 *
 * The list is read without the network, so each test that touches the transport
 * counts its hits — a read that quietly pulled would still pass a "rows are
 * there" assertion, and would still be the bug (an expired token in the paint
 * path) this store exists to remove.
 */
@RunWith(RobolectricTestRunner::class)
class HabitflowStoreTest {
    private lateinit var context: Context
    private lateinit var databases: IdentityScopedStore<HabitStores>
    private lateinit var identities: MemoryIdentityStorage

    private val alice = Identity.User("alice-id")
    private val bob = Identity.User("bob-id")

    @Before
    fun setUp() {
        context = ApplicationProvider.getApplicationContext()
        identities = MemoryIdentityStorage(alice)
        databases =
            IdentityScopedStore { identity ->
                // The real opener, so the file name is the one the app uses and a
                // reopened identity is the same database rather than a new one.
                HabitStores.open(context, identity)
            }
    }

    @After
    fun tearDown() {
        databases.close()
        for (identity in listOf(alice, bob, Identity.Guest)) {
            context.deleteDatabase(HabitDatabase.fileName(identity))
        }
    }

    @Test
    fun `a pull writes the rows and the read answers without the network`() = runBlocking {
        val transport = RecordingTransport { HttpResponse(200, SYNC_BODY) }
        val repository = repository(transport)

        assertEquals(5, (repository.pull() as ApiResult.Success).value)
        val rows = repository.rows()
        val again = repository.rows()

        assertEquals(listOf("Read Quran", "Walk"), rows.map { it.name })
        assertEquals(rows, again)
        assertEquals("a read makes no request", 1, transport.hits)
    }

    @Test
    fun `a tombstone is stored but never painted`() = runBlocking {
        val repository = repository(RecordingTransport { HttpResponse(200, SYNC_BODY) })

        repository.pull()

        assertEquals(listOf("a-1", "a-2"), repository.rows().map { it.id })
        assertEquals("the deleted log is not painted", listOf("log-1"), repository.logs().map { it.id })
        // Kept, not dropped: the next pull would re-create a habit the device
        // forgot it was told to delete (ADR-0029).
        assertEquals(1, databases.forIdentity(alice).dao().tombstones().size)
    }

    @Test
    fun `a body the contract refuses writes nothing`() = runBlocking {
        val repository = repository(RecordingTransport { HttpResponse(200, SYNC_BODY) })
        repository.pull()

        // The same store, a server that drifted: the contract names the field and
        // the rows the device already had are untouched.
        val drifted = repository(RecordingTransport { HttpResponse(200, """{"habits":"nope"}""") })
        val answer = drifted.pull()

        assertTrue(answer is ApiResult.Failure)
        assertTrue((answer as ApiResult.Failure).error is ApiError.InvalidContract)
        assertEquals(listOf("a-1", "a-2"), drifted.rows().map { it.id })
    }

    @Test
    fun `an unreachable pull leaves the last snapshot in place`() = runBlocking {
        val repository = repository(RecordingTransport { HttpResponse(200, SYNC_BODY) })
        repository.pull()

        val offline =
            repository(
                RecordingTransport { throw java.io.IOException("no radio") },
            )
        val answer = offline.pull()

        assertTrue(answer is ApiResult.Failure)
        assertEquals("the radio being off is not an empty list", 2, offline.rows().size)
    }

    @Test
    fun `two identities never see each other's rows`() = runBlocking {
        var who = alice
        val repository = repository(RecordingTransport { HttpResponse(200, SYNC_BODY) }, { who })

        repository.pull()
        assertEquals(listOf("a-1", "a-2"), repository.rows().map { it.id })

        // A sign-in for another account, in the same process.
        who = bob
        assertEquals("the new account starts empty", emptyList<HabitRow>(), repository.rows())
        assertEquals("and its own database is the one open", bob, databases.openIdentity)

        // A pull for bob does not reach alice's rows.
        repository(RecordingTransport { HttpResponse(200, BOB_SYNC_BODY) }, { who }).pull()
        assertEquals(listOf("b-1"), repository.rows().map { it.id })

        who = alice
        assertEquals("alice's rows are still hers", listOf("a-1", "a-2"), repository.rows().map { it.id })
    }

    @Test
    fun `a sign-out reads the guest namespace, not the account that left`() = runBlocking {
        var who: Identity = alice
        val repository = repository(RecordingTransport { HttpResponse(200, SYNC_BODY) }, { who })
        repository.pull()

        who = Identity.Guest

        assertEquals(emptyList<HabitRow>(), repository.rows())
        assertEquals(Identity.Guest, databases.openIdentity)
    }

    @Test
    fun `five hundred rows read back in the web's order`() = runBlocking {
        val habits =
            (0 until 500).joinToString(",") { index ->
                val id = "h-${index.toString().padStart(3, '0')}"
                """{"id":"$id","name":"Habit $index","frequency":"daily","createdAt":"2026-01-01T00:00:00Z","archived":false}"""
            }
        val body = """{"habits":[$habits],"logs":[],"mode":"supabase"}"""
        val repository = repository(RecordingTransport { HttpResponse(200, body) })

        repository.pull()
        val rows = repository.rows()

        assertEquals(500, rows.size)
        // One createdAt for all of them, so what is asserted is the tie-break a
        // second device has to agree with: id, not insertion order.
        assertEquals("h-000", rows.first().id)
        assertEquals("h-499", rows.last().id)
    }

    private suspend fun repository(
        transport: RecordingTransport,
        identity: () -> Identity = { alice },
    ): HabitflowRepository {
        val session =
            Session(MemoryTokenStore("refresh-1"), TokenRefresher { RefreshOutcome.Refused }, identities)
            .also { it.signIn(TokenPair("access-1", "refresh-1", (identity() as? Identity.User)?.id ?: "guest")) }

        return HabitflowRepository(
            databases = databases,
            identity = identity,
            client = ApiClient("https://app.test", session, transport),
        )
    }

    private companion object {
        /** Two live habits out of order, one tombstone, one live log, one tombstoned log. */
        const val SYNC_BODY = """
        {
          "habits": [
            {"id":"a-2","name":"Walk","frequency":"daily","createdAt":"2026-02-01T00:00:00Z","archived":false,"target":2,"targetPeriod":"week","reminderTime":"07:30","clientId":"c-2","updatedAt":"2026-02-01T00:00:00Z","deletedAt":null},
            {"id":"a-1","name":"Read Quran","frequency":"daily","createdAt":"2026-01-01T00:00:00Z","archived":false,"target":null,"targetPeriod":null,"reminderTime":null,"clientId":"c-1","updatedAt":"2026-01-01T00:00:00Z","deletedAt":null},
            {"id":"a-3","name":"Gone","frequency":"weekly","createdAt":"2026-01-15T00:00:00Z","archived":false,"target":null,"targetPeriod":null,"reminderTime":null,"clientId":"c-3","updatedAt":"2026-01-20T00:00:00Z","deletedAt":"2026-01-20T00:00:00Z"}
          ],
          "logs": [
            {"id":"log-1","habitId":"a-1","date":"2026-01-02","completed":true,"completedAt":"2026-01-02T06:00:00Z","kind":"complete","note":null,"clientId":"l-1","updatedAt":"2026-01-02T06:00:00Z","deletedAt":null},
            {"id":"log-2","habitId":"a-1","date":"2026-01-03","completed":false,"completedAt":null,"clientId":"l-2","updatedAt":"2026-01-03T06:00:00Z","deletedAt":"2026-01-03T07:00:00Z"}
          ],
          "mode": "supabase"
        }
        """

        const val BOB_SYNC_BODY = """
        {
          "habits": [{"id":"b-1","name":"Swim","frequency":"weekly","createdAt":"2026-03-01T00:00:00Z","archived":false}],
          "logs": [],
          "mode": "supabase"
        }
        """
    }
}
