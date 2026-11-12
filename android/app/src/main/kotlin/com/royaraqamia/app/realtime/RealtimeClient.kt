package com.royaraqamia.app.realtime

import android.util.Log
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicLong
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.withTimeoutOrNull
import kotlinx.serialization.json.JsonObject

/** One live subscription: closing it removes exactly one channel. */
fun interface RealtimeSubscription {
    fun close()
}

/**
 * A subscription that can also **speak**: a private broadcast channel the
 * member writes into, such as a peer's presence stream (ADR-0165).
 *
 * A send before the join is not a dropped event: it waits in a small queue and
 * is flushed the moment the server acknowledges the join, which is what makes
 * the first keystroke of a freshly opened thread reach the peer.
 */
interface RealtimeChannel : RealtimeSubscription {
    /** Broadcast one event, or false when it could not be queued. */
    fun send(event: String, payload: JsonObject): Boolean
}

/** The session's token as the socket needs it, with the generation a refresh changes. */
data class RealtimeToken(val accessToken: String, val generation: Int)

/**
 * The session half the Realtime client reads (ADR-0141).
 *
 * The client never keeps a token: it asks for the one in force when it connects
 * or reconnects, so a token refreshed mid-session is the one the next subscribe
 * carries. The client also asks the session to renew once when a topic is
 * refused, because the usual refusal is an access token that just expired.
 */
interface RealtimeSession {
    fun token(): RealtimeToken?

    suspend fun renew(seenGeneration: Int): Boolean
}

/**
 * The app's one Realtime client (ADR-0060, ADR-0141).
 *
 * It holds **one** Phoenix socket and joins every subscribed channel on it, so
 * three surfaces cost one connection rather than three. What arrives is a hint,
 * never a row: the client reports [RealtimeEvent.Hint] and the subscriber pulls
 * the data it already knows how to read. That is ADR-0060's rule made literal —
 * a hint can only cause a pull, so a hint at the wrong moment costs a request
 * and cannot corrupt anything.
 *
 * Three rules decide the socket's life:
 *
 * 1. **Reconnect with capped backoff.** A radio that drops, a server that
 *    closes, and a token that rotated all end the socket; the loop rejoins every
 *    channel after 1s, 2s, 4s and so on, capped at 30s. Nothing is replayed as a
 *    message — a rejoin asks the server for future changes, and the pull that
 *    follows merges by id, so a message already drawn is not drawn twice.
 * 2. **The token is read at join time.** A token refreshed while the screen is
 *    open is the one the next socket joins with, and a rotation detected on the
 *    heartbeat drops the socket so the next join uses it.
 * 3. **A refused topic is named.** The server's reason is surfaced as
 *    [RealtimeEvent.Refused] with the topic (and logged), never dropped, so a
 *    channel that is silently absent cannot look like a quiet conversation.
 *
 * The subscriptions are the screens': when the open thread leaves, its
 * subscription closes and the channel is removed. The socket outlives the last
 * one for [idleKeepAliveMs], so moving from the list to a thread joins on the
 * connection already up instead of paying a handshake (ADR-0169); once that
 * window passes with nothing to serve, the socket closes. A backgrounded
 * process still has the FCM wake of ADR-0059 for the writes that do not need a
 * socket.
 */
class RealtimeClient(
    private val url: String,
    private val session: RealtimeSession,
    private val socketFactory: RealtimeSocketFactory = Rfc6455WebSocketFactory,
    private val scope: CoroutineScope = CoroutineScope(SupervisorJob() + Dispatchers.IO),
    private val retryDelayMs: (attempt: Int) -> Long = ::defaultRetryDelay,
    private val heartbeatMs: Long = 20_000L,
    private val idleKeepAliveMs: Long = 60_000L,
    private val nowMs: () -> Long = { System.nanoTime() / 1_000_000L },
    private val log: (String) -> Unit = { Log.w(TAG, it) },
) {
    private class Subscription(
        val id: Long,
        val spec: RealtimeChannelSpec,
        val onEvent: (RealtimeEvent) -> Unit,
    ) {
        /** The ref the server acknowledged this join with, or null before it did. */
        @Volatile
        var joinRef: String? = null

        /** Sends that arrived before the join, capped so a dead topic cannot grow. */
        private val queued = ArrayDeque<Pair<String, JsonObject>>()

        fun queue(event: String, payload: JsonObject): Boolean = synchronized(this) {
            if (queued.size >= MAX_QUEUED_SENDS) return false
            queued.addLast(event to payload)
            true
        }

        fun drain(): List<Pair<String, JsonObject>> = synchronized(this) {
            queued.toList().also { queued.clear() }
        }
    }

    private sealed interface Command {
        data class Join(val id: Long, val spec: RealtimeChannelSpec) : Command

        data class Send(
            val id: Long,
            val event: String,
            val payload: JsonObject,
        ) : Command
    }

    private val lock = Any()
    private val subscriptions = LinkedHashMap<Long, Subscription>()
    private var nextId = 0L
    private var running: Job? = null

    /** When the channel set last emptied, in [nowMs]'s units. */
    private var emptySince = 0L

    /** Wakes the idle watchdog when a screen subscribes again. */
    private val wake = Channel<Unit>(Channel.CONFLATED)

    /**
     * The command channel of the connection that is up, if one is. A subscribe
     * that lands while the socket is live is joined on that socket; one that
     * lands before it is in the snapshot the connection starts with. Assigning
     * this and taking the snapshot under the same [lock] is what makes the two
     * cases cover every moment.
     */
    @Volatile
    private var outbound: Channel<Command>? = null

    /** Join one channel, read-only. The handle closes it, and the last one closes the socket. */
    fun subscribe(
        spec: RealtimeChannelSpec,
        onEvent: (RealtimeEvent) -> Unit = {},
    ): RealtimeSubscription = open(spec, onEvent)

    /** Join one channel that may also broadcast; the handle can send and close. */
    fun open(
        spec: RealtimeChannelSpec,
        onEvent: (RealtimeEvent) -> Unit = {},
    ): RealtimeChannel {
        val subscription =
            synchronized(lock) {
                val id = ++nextId
                val created = Subscription(id, spec, onEvent)
                subscriptions[id] = created
                emptySince = 0L
                // Under the same lock the connection takes its snapshot: either
                // it has already captured one (join now) or it will capture this
                // channel (do not join twice).
                outbound?.trySend(Command.Join(id, spec))
                created
            }
        // A socket waiting out its idle window has work again.
        wake.trySend(Unit)
        ensureRunning()

        return object : RealtimeChannel {
            override fun send(event: String, payload: JsonObject): Boolean {
                synchronized(subscription) {
                    if (subscription.joinRef == null) {
                        if (subscription.queue(event, payload)) return true
                        return false
                    }
                }
                return outbound?.trySend(Command.Send(subscription.id, event, payload))?.isSuccess == true
            }

            override fun close() {
                synchronized(lock) {
                    subscriptions.remove(subscription.id)
                    if (subscriptions.isEmpty()) emptySince = nowMs()
                }
                // The watchdog decides whether the window is already spent.
                wake.trySend(Unit)
            }
        }
    }

    /** Drops every channel and the socket. A sign-out or a process-level teardown. */
    fun close() {
        synchronized(lock) { subscriptions.clear() }
        running?.cancel()
        running = null
        scope.cancel()
    }

    private fun ensureRunning() {
        synchronized(lock) {
            if (running?.isActive == true) return
            running = scope.launch { runLoop() }
        }
    }

    private suspend fun runLoop() {
        var attempt = 0
        var renewGeneration: Int? = null
        while (currentCoroutineContext().isActive) {
            if (synchronized(lock) { subscriptions.isEmpty() }) break

            if (renewGeneration != null) {
                session.renew(renewGeneration)
                renewGeneration = null
            }

            val token = session.token()
            if (token == null) {
                attempt = nextAttempt(attempt)
                delay(retryDelayMs(attempt))
                continue
            }

            val outcome =
                try {
                    serve(token)
                } catch (cancelled: CancellationException) {
                    throw cancelled
                } catch (error: Exception) {
                    log("realtime socket failed: ${error.message}")
                    ServeOutcome(joined = false, renewFor = null)
                }
            attempt = if (outcome.joined) 0 else nextAttempt(attempt)
            renewGeneration = outcome.renewFor

            if (synchronized(lock) { subscriptions.isEmpty() }) break
            if (!currentCoroutineContext().isActive) break
            delay(retryDelayMs(attempt))
        }
    }

    private data class ServeOutcome(val joined: Boolean, val renewFor: Int?)

    private suspend fun serve(token: RealtimeToken): ServeOutcome =
        coroutineScope {
            val commands = Channel<Command>(Channel.UNLIMITED)
            val snapshot =
                synchronized(lock) {
                    outbound = commands
                    subscriptions.values.toList()
                }

            val events = Channel<SocketEvent>(Channel.UNLIMITED)
            val socket =
                try {
                    socketFactory.open(
                        url,
                        emptyMap(),
                        object : RealtimeSocket.Listener {
                            override fun onText(text: String) {
                                events.trySend(SocketEvent.Text(text))
                            }

                            override fun onClosed(reason: String) {
                                events.trySend(SocketEvent.Closed(reason))
                            }
                        },
                    )
                } catch (error: Exception) {
                    synchronized(lock) { outbound = null }
                    log("realtime could not open ${url.substringBefore('?')}: ${error.message}")
                    return@coroutineScope ServeOutcome(joined = false, renewFor = null)
                }

            val pending = ConcurrentHashMap<String, Subscription>()
            val refs = AtomicLong()
            var joined = false
            var renewFor: Int? = null

            try {
                // The snapshot joins through the same path as a later subscribe,
                // so there is one place that mints a ref and one pending map.
                for (subscription in snapshot) {
                    commands.trySend(Command.Join(subscription.id, subscription.spec))
                }

                val writer =
                    launch {
                        for (command in commands) {
                            when (command) {
                                is Command.Join -> {
                                    val ref = refs.incrementAndGet().toString()
                                    val subscription =
                                        synchronized(lock) { subscriptions[command.id] }
                                            ?: continue
                                    pending[ref] = subscription
                                    socket.send(
                                        RealtimeProtocol.join(subscription.spec, token.accessToken, ref)
                                    )
                                }

                                is Command.Send -> {
                                    val subscription =
                                        synchronized(lock) { subscriptions[command.id] }
                                            ?: continue
                                    val joinRef = subscription.joinRef ?: continue
                                    val ref = refs.incrementAndGet().toString()
                                    socket.send(
                                        RealtimeProtocol.push(
                                            joinRef = joinRef,
                                            topic = subscription.spec.topic,
                                            event = command.event,
                                            payload = command.payload,
                                            ref = ref,
                                        )
                                    )
                                }
                            }
                        }
                    }

                val heartbeat =
                    launch {
                        var beat = 1_000L
                        while (currentCoroutineContext().isActive) {
                            delay(heartbeatMs)
                            beat += 1
                            try {
                                socket.send(RealtimeProtocol.heartbeat(beat.toString()))
                            } catch (_: Exception) {
                                socket.close()
                                return@launch
                            }
                            val current = session.token()
                            if (current == null || current.generation != token.generation) {
                                // The session rotated or ended under us: drop the
                                // socket so the next join carries the token that is
                                // in force (or waits for a sign-in).
                                socket.close()
                                return@launch
                            }
                        }
                    }

                // The socket is the screens', not one of them (ADR-0169): with
                // no channel on it, it waits out the idle window so the next
                // screen joins instead of dialling, then closes. Closing the
                // socket is what ends `serve`.
                val idle =
                    launch {
                        while (currentCoroutineContext().isActive) {
                            val remaining =
                                synchronized(lock) {
                                    if (subscriptions.isNotEmpty()) null
                                    else idleKeepAliveMs - (nowMs() - emptySince)
                                }
                            if (remaining == null) {
                                wake.receive()
                                continue
                            }
                            if (remaining <= 0) {
                                socket.close()
                                return@launch
                            }
                            withTimeoutOrNull(remaining) { wake.receive() }
                        }
                    }

                try {
                    for (event in events) {
                        when (event) {
                            is SocketEvent.Closed -> break
                            is SocketEvent.Text -> {
                                val incoming = RealtimeProtocol.parse(event.text) ?: continue
                                val delivered = deliver(incoming, pending)
                                when (delivered) {
                                    is Delivered.Joined -> {
                                        joined = true
                                        flush(delivered.subscription, socket, refs)
                                    }
                                    is Delivered.Refused -> {
                                        // A refusal is the one answer a rejoin can
                                        // fix: drop the socket, renew once, and let
                                        // the reconnect carry the new token.
                                        renewFor = token.generation
                                        break
                                    }
                                    Delivered.Ignored -> Unit
                                }
                            }
                        }
                    }
                } finally {
                    heartbeat.cancel()
                    writer.cancel()
                    idle.cancel()
                }
            } finally {
                synchronized(lock) { outbound = null }
                // A send queued for this socket belongs to the next one: the join
                // ref it named is gone, so the queue waits for the next acknowledge.
                for (subscription in synchronized(lock) { subscriptions.values.toList() }) {
                    subscription.joinRef = null
                }
                commands.close()
                socket.close()
            }

            ServeOutcome(joined = joined, renewFor = renewFor)
        }

    private sealed interface Delivered {
        object Ignored : Delivered

        data class Joined(val subscription: Subscription) : Delivered

        object Refused : Delivered
    }

    /**
     * Routes one parsed frame to its channel. The reply ref is what names a
     * refusal: the join that was refused is the one whose ref the server echoes,
     * which is why every join gets its own ref rather than a shared channel name.
     */
    private fun deliver(
        incoming: RealtimeProtocol.Incoming,
        pending: ConcurrentHashMap<String, Subscription>,
    ): Delivered {
        val current = synchronized(lock) { subscriptions.values.toList() }
        val byWireTopic = current.associateBy { RealtimeProtocol.wireTopic(it.spec.topic) }

        return when (incoming) {
            is RealtimeProtocol.Incoming.Reply -> {
                val subscription = incoming.ref?.let { pending.remove(it) } ?: return Delivered.Ignored
                if (incoming.ok) {
                    subscription.joinRef = incoming.ref
                    subscription.onEvent(RealtimeEvent.Ready(subscription.spec.topic))
                    Delivered.Joined(subscription)
                } else {
                    refuse(subscription, incoming.reason ?: "the server refused the channel")
                    Delivered.Refused
                }
            }

            is RealtimeProtocol.Incoming.Change -> {
                byWireTopic[incoming.topic]?.let { it.onEvent(RealtimeEvent.Hint(it.spec.topic)) }
                Delivered.Ignored
            }

            is RealtimeProtocol.Incoming.Broadcast -> {
                byWireTopic[incoming.topic]?.let {
                    it.onEvent(RealtimeEvent.Broadcast(it.spec.topic, incoming.event, incoming.payload))
                }
                Delivered.Ignored
            }

            is RealtimeProtocol.Incoming.Error -> {
                val subscription = byWireTopic[incoming.topic] ?: return Delivered.Ignored
                refuse(subscription, incoming.reason)
                Delivered.Refused
            }
        }
    }

    private fun refuse(subscription: Subscription, reason: String) {
        subscription.onEvent(RealtimeEvent.Refused(subscription.spec.topic, reason))
        log("realtime refused ${subscription.spec.topic}: $reason")
    }

    /**
     * Sends what a channel queued before its join was acknowledged. Called from
     * the socket's own coroutine, so the frames keep the connection's order.
     */
    private fun flush(subscription: Subscription, socket: RealtimeSocket, refs: AtomicLong) {
        val joinRef = subscription.joinRef ?: return
        for ((event, payload) in subscription.drain()) {
            val ref = refs.incrementAndGet().toString()
            socket.send(
                RealtimeProtocol.push(
                    joinRef = joinRef,
                    topic = subscription.spec.topic,
                    event = event,
                    payload = payload,
                    ref = ref,
                )
            )
        }
    }

    private sealed interface SocketEvent {
        data class Text(val text: String) : SocketEvent

        data class Closed(val reason: String) : SocketEvent
    }
}

private const val TAG = "RoyRealtime"

/** A channel that never joins must not grow an unbounded outbox. */
private const val MAX_QUEUED_SENDS = 8

private const val MAX_ATTEMPT = 5

private fun nextAttempt(attempt: Int): Int = (attempt + 1).coerceAtMost(MAX_ATTEMPT)

/** 1s, 2s, 4s, 8s, 16s, then 30s. A radio that comes back does not wait long. */
private fun defaultRetryDelay(attempt: Int): Long =
    minOf(30_000L, 1_000L shl minOf(attempt, MAX_ATTEMPT))
