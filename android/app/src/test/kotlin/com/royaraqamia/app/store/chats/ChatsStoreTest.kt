package com.royaraqamia.app.store.chats

import android.content.Context
import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import com.royaraqamia.app.store.Identity
import com.royaraqamia.app.store.outbox.OutboxIntentRow
import kotlinx.coroutines.runBlocking
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/**
 * Chats' Local Store (#1127): the windows it keeps, the retention it sweeps, and
 * the transaction that makes a line durable before it is sent.
 *
 * JVM tests against a real SQLite database (Robolectric), because the claim is
 * about rows on disk surviving a launch with no radio; a fake would prove only
 * that the fake keeps them.
 */
@RunWith(RobolectricTestRunner::class)
class ChatsStoreTest {
    private lateinit var context: Context
    private lateinit var database: ChatsDatabase
    private lateinit var dao: ChatsDao

    private val alice = Identity.User("alice-id")
    private val bob = Identity.User("bob-id")

    @Before
    fun setUp() {
        context = ApplicationProvider.getApplicationContext()
        database =
            Room.inMemoryDatabaseBuilder(context, ChatsDatabase::class.java)
                .allowMainThreadQueries()
                .build()
        dao = database.chats()
    }

    @After
    fun tearDown() {
        database.close()
        for (identity in listOf(alice, bob, Identity.Guest)) {
            context.deleteDatabase(ChatsDatabase.fileName(identity))
        }
    }

    @Test
    fun `the list keeps the twenty newest threads`() = runBlocking {
        dao.upsertThreads(
            (1..21).map { index ->
                thread("t-$index", lastMessageAt = "2026-11-01T00:00:${index.toString().padStart(2, '0')}.000Z")
            }
        )

        dao.trimThreads(20)

        val kept = dao.threads(50).map { it.id }
        assertEquals(20, kept.size)
        assertTrue("t-1" !in kept)
        assertEquals("t-21", kept.first())
    }

    @Test
    fun `a thread keeps its newest two hundred lines`() = runBlocking {
        dao.upsertMessages(
            (1..201).map { index ->
                message(
                    id = "m-$index",
                    conversationId = "c-1",
                    createdAt = "2026-11-01T00:00:00.${index.toString().padStart(3, '0')}Z",
                )
            }
        )

        dao.trimMessages("c-1", 200)

        val kept = dao.messages("c-1").map { it.id }
        assertEquals(200, kept.size)
        assertTrue("m-1" !in kept)
        assertEquals("m-201", kept.last())
    }

    @Test
    fun `thirty days sweeps the list, the header and the lines`() = runBlocking {
        val now = 1_800_000_000_000L
        val stale = now - 31L * 24 * 60 * 60 * 1_000
        dao.upsertThreads(listOf(thread("old", storedAt = stale), thread("new", storedAt = now)))
        dao.upsertHeader(ChatHeaderRow("old", "{}", stale))
        dao.upsertHeader(ChatHeaderRow("new", "{}", now))
        dao.upsertMessages(
            listOf(
                message("old", "c-old", storedAt = stale),
                message("new", "c-new", storedAt = now),
            )
        )

        val cutoff = now - 30L * 24 * 60 * 60 * 1_000
        dao.pruneThreads(cutoff)
        dao.pruneHeaders(cutoff)
        dao.pruneMessages(cutoff)

        assertEquals(listOf("new"), dao.threads(10).map { it.id })
        assertNull(dao.header("old"))
        assertNotNull(dao.header("new"))
        assertTrue(dao.messages("c-old").isEmpty())
        assertEquals(listOf("new"), dao.messages("c-new").map { it.id })
    }

    @Test
    fun `a header survives without its list row, which is a deep link`() = runBlocking {
        // Opening a notification's thread URL caches the header before the list
        // has ever been read; the header is pruned by age, never by the list.
        dao.upsertHeader(ChatHeaderRow("deep-link", "{}", 1))
        assertNotNull(dao.header("deep-link"))
    }

    @Test
    fun `a line and its intent commit together, and the server row replaces the twin`() = runBlocking {
        val local =
            message(
                id = ChatOrders.local("client-1"),
                conversationId = "c-1",
                clientId = "client-1",
                body = "queued",
            )
        dao.commitMessage(
            local,
            OutboxIntentRow.pending(
                id = "client-1",
                entity = "c-1",
                type = "message.send",
                payload = """{"conversationId":"c-1","clientId":"client-1","body":"queued"}""",
                createdAt = 1,
            ),
        )

        assertEquals(listOf(local.id), dao.messages("c-1").map { it.id })
        assertEquals(1, dao.outbox().size)

        dao.applyServerMessage(
            local.copy(id = "server-1"),
            local.id,
        )

        assertEquals(listOf("server-1"), dao.messages("c-1").map { it.id })
        // The intent is the drainer's to remove, not the replacement's.
        assertEquals(1, dao.outbox().size)
    }

    /** The local row id the repository mints, kept in one place in this test. */
    private object ChatOrders {
        fun local(clientId: String) = "local:$clientId"
    }

    private fun thread(
        id: String,
        lastMessageAt: String? = "2026-11-01T00:00:00.000Z",
        storedAt: Long = 1_800_000_000_000L,
    ) = ChatThreadRow(
        id = id,
        json = "{}",
        lastMessageAt = lastMessageAt,
        createdAt = "2026-11-01T00:00:00.000Z",
        storedAt = storedAt,
    )

    private fun message(
        id: String,
        conversationId: String,
        clientId: String? = null,
        body: String = "line",
        storedAt: Long = 1_800_000_000_000L,
        createdAt: String = "2026-11-01T00:00:00.000Z",
    ) = ChatMessageRow(
        id = id,
        conversationId = conversationId,
        clientId = clientId,
        createdAt = createdAt,
        json = """{"id":"$id","conversationId":"$conversationId","body":"$body"}""",
        storedAt = storedAt,
    )
}
