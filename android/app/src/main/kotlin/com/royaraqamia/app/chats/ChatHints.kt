package com.royaraqamia.app.chats

import com.royaraqamia.app.realtime.PostgresChange
import com.royaraqamia.app.realtime.RealtimeChannelSpec
import com.royaraqamia.app.realtime.RealtimeClient
import com.royaraqamia.app.realtime.RealtimeEvent
import com.royaraqamia.app.realtime.RealtimeSubscription

/**
 * What an open thread listens for (ADR-0060, ADR-0113, ADR-0116).
 *
 * Both sources are **hints**, not payloads: a line or a roster row changing
 * means "run the pull the screen already has", and the pull merges by id. That
 * is why a reconnect cannot replay an already-drawn message — the only thing a
 * reconnect can cause is another read, and a read is idempotent.
 */
fun interface ChatHintSource {
    fun subscribe(conversationId: String, onHint: () -> Unit): RealtimeSubscription
}

/**
 * The two tables an open thread watches, published for Realtime in the chats
 * migration (`20261103090000_chats.sql`, ADR-0113): `chat_messages` for a new
 * line, an edit or a tombstone, and `chat_participants` for the peer's read
 * watermark moving.
 */
class RealtimeChatHints(private val client: RealtimeClient) : ChatHintSource {
    override fun subscribe(conversationId: String, onHint: () -> Unit): RealtimeSubscription {
        val lines =
            client.subscribe(ChatRealtime.threadSpec(conversationId)) { event ->
                if (event is RealtimeEvent.Hint) onHint()
            }
        val roster =
            client.subscribe(ChatRealtime.rosterSpec(conversationId)) { event ->
                if (event is RealtimeEvent.Hint) onHint()
            }
        return RealtimeSubscription {
            lines.close()
            roster.close()
        }
    }
}

/**
 * The chat channels' wire names, kept beside the tables they read so a surface
 * never invents a topic of its own.
 */
object ChatRealtime {
    /** The one event the private presence stream carries (ADR-0165). */
    const val PRESENCE = "presence"

    /** One open thread: new lines, edits and tombstones for this conversation. */
    fun threadSpec(conversationId: String): RealtimeChannelSpec =
        RealtimeChannelSpec(
            topic = "chat-thread:$conversationId",
            postgresChanges =
                listOf(
                    PostgresChange(
                        table = "chat_messages",
                        filter = "conversation_id=eq.$conversationId",
                    )
                ),
        )

    /** The roster of an open thread: a peer's read watermark is a row update. */
    fun rosterSpec(conversationId: String): RealtimeChannelSpec =
        RealtimeChannelSpec(
            topic = "chat-roster:$conversationId",
            postgresChanges =
                listOf(
                    PostgresChange(
                        table = "chat_participants",
                        filter = "conversation_id=eq.$conversationId",
                    )
                ),
        )

    /**
     * A conversation's private presence topic (ADR-0167). Both members join it:
     * the same subscription hears the peer and announces the member, because
     * Realtime authorises a join against the read policy and a write-only
     * channel is not a shape it admits.
     */
    fun presenceSpec(conversationId: String): RealtimeChannelSpec =
        RealtimeChannelSpec(
            topic = "presence:$conversationId",
            broadcasts = setOf(PRESENCE),
            isPrivate = true,
        )
}
