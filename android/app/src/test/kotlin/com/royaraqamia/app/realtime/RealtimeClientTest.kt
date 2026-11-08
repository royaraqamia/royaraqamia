package com.royaraqamia.app.realtime

import com.royaraqamia.app.chats.ChatRealtime
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeout
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * The Realtime client's three promises (ADR-0141), driven by a scripted socket
 * rather than a server: a change is a hint, a refusal names its topic, and a
 * reconnect joins with the token the session holds *now*.
 */
class RealtimeClientTest {
    private val json = Json { ignoreUnknownKeys = true }

    @Test
    fun `a change on the thread's table is a hint, never a payload`() = runBlocking {
        val factory = FakeSocketFactory()
        val client = client(factory, FakeSession(RealtimeToken("token-1", 1)))
        val hinted = CompletableDeferred<Unit>()

        val subscription =
            client.subscribe(ChatRealtime.threadSpec("c-1")) { event ->
                if (event is RealtimeEvent.Hint) hinted.complete(Unit)
            }

        val socket = factory.awaitSocket(1)
        val join = socket.await { it.contains("phx_join") }
        assertTrue("the join names the wire topic: $join", join.contains("realtime:chat-thread:c-1"))
        assertTrue("the join names the table: $join", join.contains("chat_messages"))
        assertTrue("the join names the filter: $join", join.contains("conversation_id=eq.c-1"))

        socket.emit(reply(refOf(join), "ok"))
        socket.emit(
            """{"topic":"realtime:chat-thread:c-1","event":"postgres_changes","payload":{"data":{}},"ref":null}"""
        )

        withTimeout(2_000) { hinted.await() }
        subscription.close()
        client.close()
    }

    @Test
    fun `a refused topic is named, and the next join carries the renewed token`() = runBlocking {
        val factory = FakeSocketFactory()
        val session = FakeSession(RealtimeToken("token-1", 1))
        val client = client(factory, session)
        val refused = CompletableDeferred<RealtimeEvent.Refused>()

        val subscription =
            client.subscribe(ChatRealtime.threadSpec("c-1")) { event ->
                if (event is RealtimeEvent.Refused) refused.complete(event)
            }

        val firstSocket = factory.awaitSocket(1)
        val first = firstSocket.await { it.contains("phx_join") && it.contains("token-1") }
        firstSocket.emit(reply(refOf(first), "error", "unauthorized"))

        val event = withTimeout(2_000) { refused.await() }
        assertEquals("the refusal names the topic", "chat-thread:c-1", event.topic)
        assertEquals("the refusal carries the server's reason", "unauthorized", event.reason)

        val rejoined =
            factory
                .awaitSocket(count = 2)
                .await { it.contains("phx_join") && it.contains("new-token") }
        assertTrue("the reconnect joins with the refreshed token: $rejoined", rejoined.isNotEmpty())
        assertEquals("the session was asked once", 1, session.renews)

        subscription.close()
        client.close()
    }

    @Test
    fun `a reconnect after the socket is lost joins with the token in force`() = runBlocking {
        val factory = FakeSocketFactory()
        val session = FakeSession(RealtimeToken("token-1", 1))
        val client = client(factory, session)

        val subscription = client.subscribe(ChatRealtime.rosterSpec("c-1"))
        val firstSocket = factory.awaitSocket(1)
        val first = firstSocket.await { it.contains("phx_join") }
        firstSocket.emit(reply(refOf(first), "ok"))

        session.tokenValue = RealtimeToken("token-2", 2)
        firstSocket.drop()

        val rejoined =
            factory
                .awaitSocket(count = 2)
                .await { it.contains("phx_join") && it.contains("token-2") }
        assertTrue("the rejoin uses the current token: $rejoined", rejoined.contains("chat_participants"))

        subscription.close()
        client.close()
    }

    @Test
    fun `two subscriptions share one socket`() = runBlocking {
        val factory = FakeSocketFactory()
        val client = client(factory, FakeSession(RealtimeToken("token-1", 1)))

        val hints = client.subscribe(ChatRealtime.threadSpec("c-1"))
        val roster = client.subscribe(ChatRealtime.rosterSpec("c-1"))

        val socket = factory.awaitSocket(1)
        socket.await { it.contains("chat_messages") }
        socket.await { it.contains("chat_participants") }
        assertEquals("one socket for both channels", 1, factory.count())

        hints.close()
        roster.close()
        client.close()
    }

    private fun client(factory: FakeSocketFactory, session: FakeSession): RealtimeClient =
        RealtimeClient(
            url = "wss://example.test/realtime/v1/websocket?apikey=public&vsn=1.0.0",
            session = session,
            socketFactory = factory,
            scope = CoroutineScope(SupervisorJob() + Dispatchers.Default),
            retryDelayMs = { 20L },
            heartbeatMs = 10_000L,
            log = { },
        )

    private fun refOf(join: String): String =
        json.parseToJsonElement(join).jsonObject["ref"]!!.jsonPrimitive.content

    private fun reply(ref: String, status: String, reason: String? = null): String {
        val response = if (reason == null) "{}" else """{"reason":"$reason"}"""
        return """{"topic":"realtime:chat-thread:c-1","event":"phx_reply","ref":"$ref","payload":{"status":"$status","response":$response}}"""
    }

    private class FakeSession(
        @Volatile var tokenValue: RealtimeToken?,
    ) : RealtimeSession {
        var renews = 0

        override fun token(): RealtimeToken? = tokenValue

        override suspend fun renew(seenGeneration: Int): Boolean {
            renews += 1
            tokenValue = RealtimeToken("new-token", seenGeneration + 1)
            return true
        }
    }

    private class FakeSocketFactory : RealtimeSocketFactory {
        private val sockets = mutableListOf<FakeSocket>()

        override fun open(
            url: String,
            headers: Map<String, String>,
            listener: RealtimeSocket.Listener,
        ): RealtimeSocket {
            val socket = FakeSocket().also { it.attach(listener) }
            synchronized(sockets) { sockets += socket }
            return socket
        }

        fun latest(): FakeSocket = synchronized(sockets) { sockets.last() }

        fun count(): Int = synchronized(sockets) { sockets.size }

        suspend fun awaitSocket(count: Int): FakeSocket {
            val deadline = System.nanoTime() + 3_000_000_000L
            while (System.nanoTime() < deadline) {
                synchronized(sockets) {
                    if (sockets.size >= count) return sockets[count - 1]
                }
                delay(10)
            }
            error("no socket #$count was opened")
        }
    }

    private class FakeSocket : RealtimeSocket {
        private val lock = Any()
        private val sent = mutableListOf<String>()
        private var listener: RealtimeSocket.Listener? = null

        fun attach(listener: RealtimeSocket.Listener) {
            this.listener = listener
        }

        override fun send(text: String) {
            synchronized(lock) { sent += text }
        }

        override fun close() = Unit

        fun emit(text: String) {
            listener?.onText(text)
        }

        fun drop() {
            listener?.onClosed("the radio went")
        }

        suspend fun await(predicate: (String) -> Boolean): String {
            val deadline = System.nanoTime() + 3_000_000_000L
            while (System.nanoTime() < deadline) {
                synchronized(lock) { sent.lastOrNull(predicate) }?.let { return it }
                delay(10)
            }
            val all = synchronized(lock) { sent.toList() }
            error("no matching frame was sent; sent=$all")
        }
    }
}
