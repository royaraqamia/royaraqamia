package com.royaraqamia.app.chats

import android.content.Context
import androidx.test.core.app.ApplicationProvider
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
import com.royaraqamia.app.store.chats.ChatsDatabase
import com.royaraqamia.app.store.chats.ChatsStores
import com.royaraqamia.app.store.outbox.WriteClock
import com.royaraqamia.app.support.RecordingTransport
import java.io.IOException
import kotlinx.coroutines.runBlocking
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/**
 * The chats repository on the device (#1127): what a failed read answers, and
 * what a line written without a radio leaves behind.
 *
 * The store's own windows are `ChatsStoreTest`; this is the layer above it — the
 * read-through, the cache fallback and the replay — driven through a real
 * `ApiClient` with the recording transport the other repositories' suites use.
 */
@RunWith(RobolectricTestRunner::class)
class ChatsRepositoryTest {
    private lateinit var context: Context
    private lateinit var databases: IdentityScopedStore<ChatsStores>
    private lateinit var identities: MemoryIdentityStorage

    private val alice = Identity.User("alice-id")

    @Before
    fun setUp() {
        context = ApplicationProvider.getApplicationContext()
        identities = MemoryIdentityStorage(alice)
        databases = IdentityScopedStore { identity -> ChatsStores.open(context, identity) }
    }

    @After
    fun tearDown() {
        databases.close()
        context.deleteDatabase(ChatsDatabase.fileName(alice))
        context.deleteDatabase(ChatsDatabase.fileName(Identity.Guest))
    }

    @Test
    fun `a failed list read answers from the device`() = runBlocking {
        val online = repository(RecordingTransport { HttpResponse(200, THREADS_BODY) })
        assertTrue(online.threads() is ApiResult.Success)

        val offline = repository(RecordingTransport { throw IOException("no radio") })
        val cached = offline.threads()

        assertTrue(cached is ApiResult.Success)
        assertEquals(listOf("c-1"), (cached as ApiResult.Success).value.map { it.id })
    }

    @Test
    fun `a failed thread and its lines answer from the device`() = runBlocking {
        val online =
            repository(
                RecordingTransport { request ->
                    if (request.url.endsWith("/messages")) HttpResponse(200, MESSAGES_BODY)
                    else HttpResponse(200, THREAD_BODY)
                }
            )
        val onlineThread = online.thread("c-1")
        val onlinePage = online.messages("c-1")
        assertTrue("thread: $onlineThread", onlineThread is ApiResult.Success)
        assertTrue("messages: $onlinePage", onlinePage is ApiResult.Success)

        val offline = repository(RecordingTransport { throw IOException("no radio") })
        val thread = offline.thread("c-1")
        val page = offline.messages("c-1")

        assertTrue(thread is ApiResult.Success)
        assertTrue(page is ApiResult.Success)
        assertEquals("c-1", (thread as ApiResult.Success).value.id)
        assertEquals(listOf("hello"), (page as ApiResult.Success).value.messages.map { it.body })
    }

    @Test
    fun `an offline send is durable and says the queue owes it`() = runBlocking {
        val repository = repository(RecordingTransport { throw IOException("no radio") }, online = { false })

        assertTrue(repository.send("c-1", "queued line", senderId = "me-1") is ApiResult.Success)

        assertEquals(ChatPending.Queued, repository.pending("c-1")["client-1"])
        val cached = repository.cachedMessages("c-1")
        assertEquals(listOf("queued line"), cached.map { it.body })
        assertEquals("me-1", cached.single().senderId)
        assertEquals(1, repository.outboxStatus().pending)
    }

    @Test
    fun `an online send replays with the client id and the server row replaces the twin`() = runBlocking {
        val transport = RecordingTransport { HttpResponse(200, SEND_BODY) }
        val repository = repository(transport)

        assertTrue(repository.send("c-1", "queued line", senderId = "me-1") is ApiResult.Success)

        val sent = transport.requests.single()
        assertEquals("POST", sent.method)
        assertTrue(sent.url.endsWith("/api/chats/c-1/messages"))
        assertTrue("the replay carries the minted id", sent.body.orEmpty().contains("client-1"))
        assertEquals(listOf("server-1"), repository.cachedMessages("c-1").map { it.id })
        assertTrue(repository.pending("c-1").isEmpty())
        assertEquals(0, repository.outboxStatus().pending)
    }

    @Test
    fun `a permanent refusal is kept, surfaced, and never dropped`() = runBlocking {
        val transport =
            RecordingTransport { HttpResponse(403, """{"success":false,"error":"blocked"}""") }
        val repository = repository(transport)

        assertTrue(repository.send("c-1", "queued line", senderId = "me-1") is ApiResult.Success)

        assertEquals(ChatPending.Failed, repository.pending("c-1")["client-1"])
        assertEquals(1, repository.outboxStatus().failed)
        assertEquals("the line is still on the device", 1, repository.cachedMessages("c-1").size)
    }

    @Test
    fun `the directory is read with the member's term`() = runBlocking {
        val transport = RecordingTransport { HttpResponse(200, MEMBERS_BODY) }
        val repository = repository(transport)

        val answer = repository.members(" al ")

        assertEquals(listOf("p-1"), (answer as ApiResult.Success).value.map { it.id })
        assertTrue(transport.requests.single().url.endsWith("/api/chats/members?q=al"))
    }

    @Test
    fun `a group is created with its title and members and answers its thread`() = runBlocking {
        val transport =
            RecordingTransport { HttpResponse(201, """{"success":true,"conversationId":"g-1"}""") }
        val repository = repository(transport)

        val answer = repository.createGroup("فريق التصميم", listOf("p-1", "p-2"))

        assertEquals("g-1", (answer as ApiResult.Success).value)
        val sent = transport.requests.single()
        assertEquals("POST", sent.method)
        assertTrue(sent.url.endsWith("/api/chats/groups"))
        assertTrue(sent.body.orEmpty().contains("فريق التصميم"))
        assertTrue(sent.body.orEmpty().contains("p-1"))
        assertTrue(sent.body.orEmpty().contains("p-2"))
    }

    @Test
    fun `a refused group carries the server's sentence`() = runBlocking {
        val transport =
            RecordingTransport {
                HttpResponse(400, """{"success":false,"error":"عدد الأعضاء يتجاوز الحد"}""")
            }
        val repository = repository(transport)

        val answer = repository.createGroup("فريق", List(32) { "p-$it" })

        assertTrue(answer is ApiResult.Failure)
        val error = (answer as ApiResult.Failure).error
        assertEquals("عدد الأعضاء يتجاوز الحد", ChatFailure.sentenceOf(error))
    }

    private suspend fun repository(
        transport: RecordingTransport,
        online: () -> Boolean = { true },
        identity: () -> Identity = { alice },
    ): ChatsRepository {
        val session =
            Session(MemoryTokenStore("refresh-1"), TokenRefresher { RefreshOutcome.Refused }, identities)
                .also {
                    it.signIn(
                        TokenPair(
                            "access-1",
                            "refresh-1",
                            (identity() as? Identity.User)?.id ?: "guest",
                        )
                    )
                }
        return ChatsRepository(
            client = ApiClient("https://app.test", session, transport),
            databases = databases,
            identity = identity,
            signedIn = { true },
            online = online,
            clock = FixedClock,
            nowMillis = { NOW },
            random = { 0.0 },
        )
    }

    /** The minted id is the assertion, so the clock gives it a name. */
    private object FixedClock : WriteClock {
        override fun uuid(): String = "client-1"

        override fun nowIso(): String = "2026-11-01T00:00:00.000Z"

        override fun today(): String = "2026-11-01"
    }

    private companion object {
        const val NOW = 1_800_000_000_000L

        const val MEMBERS_BODY = """
        {
          "success": true,
          "members": [
            {
              "id": "p-1",
              "username": "alber",
              "name": "Alber",
              "avatarUrl": null,
              "verified": true
            }
          ]
        }
        """

        const val THREADS_BODY = """
        {
          "success": true,
          "threads": [
            {
              "id": "c-1",
              "kind": "direct",
              "status": "active",
              "title": "Peer",
              "counterpart": null,
              "myStatus": "active",
              "lastMessage": null,
              "unreadCount": 0,
              "lastMessageAt": null,
              "createdAt": "2026-11-01T00:00:00.000Z"
            }
          ]
        }
        """

        const val THREAD_BODY = """
        {
          "success": true,
          "thread": {
            "id": "c-1",
            "kind": "direct",
            "status": "active",
            "title": "Peer",
            "counterpart": null,
            "myStatus": "active",
            "lastMessage": null,
            "unreadCount": 0,
            "lastMessageAt": null,
            "createdAt": "2026-11-01T00:00:00.000Z",
            "participants": [],
            "me": null,
            "blockedByMe": false,
            "canWrite": true,
            "attachmentQuota": {
              "fileBytes": 0,
              "today": {"usedBytes": 0, "limitBytes": 0},
              "total": {"usedBytes": 0, "limitBytes": 0},
              "project": {"usedBytes": 0, "limitBytes": 0}
            }
          }
        }
        """

        const val MESSAGES_BODY = """
        {
          "success": true,
          "messages": [
            {
              "id": "m-1",
              "conversationId": "c-1",
              "senderId": "peer-1",
              "senderKind": "user",
              "body": "hello",
              "replyToId": null,
              "editedAt": null,
              "deletedAt": null,
              "createdAt": "2026-11-01T00:00:00.000Z",
              "clientId": null,
              "attachments": []
            }
          ],
          "nextCursor": null
        }
        """

        const val SEND_BODY = """
        {
          "success": true,
          "message": {
            "id": "server-1",
            "conversationId": "c-1",
            "senderId": "me-1",
            "senderKind": "user",
            "body": "queued line",
            "replyToId": null,
            "editedAt": null,
            "deletedAt": null,
            "createdAt": "2026-11-01T00:00:00.000Z",
            "clientId": "client-1",
            "attachments": []
          }
        }
        """
    }
}
