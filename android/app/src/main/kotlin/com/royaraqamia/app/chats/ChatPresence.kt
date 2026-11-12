package com.royaraqamia.app.chats

import com.royaraqamia.app.realtime.RealtimeChannel
import com.royaraqamia.app.realtime.RealtimeClient
import com.royaraqamia.app.realtime.RealtimeEvent
import com.royaraqamia.app.realtime.RealtimeSubscription
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

/** The two live states a peer can be in, as the wire names them. */
enum class ChatPresenceState(val wire: String) {
    Typing("typing"),
    Recording("recording"),
}

/**
 * One member's live state in one conversation (ADR-0165).
 *
 * [state] is the wire word, including [ChatPresence.STOP], because the end of a
 * state is an event too. [presence] is the drawable half: null for a stop.
 */
data class ChatPresenceEvent(
    val conversationId: String,
    val userId: String,
    val state: String,
) {
    val presence: ChatPresenceState?
        get() = ChatPresenceState.entries.firstOrNull { it.wire == state }
}

/**
 * The presence contract, in the words the site uses.
 *
 * The topic is a conversation's own, `presence:<conversation id>`: both members
 * join it, hear the other, and announce through the same join (ADR-0167).
 * Nothing is stored; the windows below are the whole lifetime of an indicator.
 */
object ChatPresence {
    const val EVENT = ChatRealtime.PRESENCE
    const val STOP = "stop"

    const val TYPING_THROTTLE_MS = 4_000L
    const val TYPING_TIMEOUT_MS = 5_000L
    const val RECORDING_HEARTBEAT_MS = 4_000L
    const val RECORDING_TIMEOUT_MS = 6_000L

    /** The state a member is in, or null when the event is not ours to draw. */
    fun eventOf(payload: JsonObject, selfId: String): ChatPresenceEvent? {
        val conversationId = payload.text("conversationId") ?: return null
        val userId = payload.text("userId") ?: return null
        val state = payload.text("state") ?: return null
        if (conversationId.isEmpty() || userId.isEmpty() || userId == selfId) return null
        if (state != "typing" && state != "recording" && state != STOP) return null
        return ChatPresenceEvent(conversationId, userId, state)
    }

    private fun JsonObject.text(key: String): String? =
        (get(key) as? JsonPrimitive)?.takeIf { it.isString }?.content
}

/** A handle that writes into one conversation's presence topic. */
interface ChatPresencePublisher : RealtimeSubscription {
    fun announce(conversationId: String, state: String): Boolean
}

/**
 * Where the app's two screens get presence from (ADR-0167).
 *
 * [listen] joins one topic per conversation, because presence is the thread's;
 * [publisher] joins the same topic to write. Both are the site's topics and the
 * site's payload, so a state the app draws is one the web would draw too.
 */
interface ChatPresenceSource {
    fun listen(
        conversationIds: Set<String>,
        selfId: String,
        onEvent: (ChatPresenceEvent) -> Unit,
    ): RealtimeSubscription

    fun publisher(conversationId: String, selfId: String): ChatPresencePublisher
}

/** Several conversations' presence, closed together when the screen leaves. */
private class ChatPresenceSubscriptions(
    private val subscriptions: List<RealtimeSubscription>,
) : RealtimeSubscription {
    override fun close() {
        subscriptions.forEach { it.close() }
    }
}

/** The one Realtime client, carrying presence on the same socket as the hints. */
class RealtimeChatPresence(private val client: RealtimeClient) : ChatPresenceSource {
    override fun listen(
        conversationIds: Set<String>,
        selfId: String,
        onEvent: (ChatPresenceEvent) -> Unit,
    ): RealtimeSubscription =
        ChatPresenceSubscriptions(
            conversationIds.map { conversationId ->
                client.subscribe(ChatRealtime.presenceSpec(conversationId)) { event ->
                    if (event is RealtimeEvent.Broadcast && event.event == ChatPresence.EVENT) {
                        ChatPresence.eventOf(event.payload, selfId)?.let { presence ->
                            if (presence.conversationId == conversationId) onEvent(presence)
                        }
                    }
                }
            }
        )

    override fun publisher(conversationId: String, selfId: String): ChatPresencePublisher {
        val channel: RealtimeChannel = client.open(ChatRealtime.presenceSpec(conversationId))
        return object : ChatPresencePublisher {
            override fun announce(conversationId: String, state: String): Boolean =
                channel.send(
                    ChatPresence.EVENT,
                    buildJsonObject {
                        put("conversationId", conversationId)
                        put("userId", selfId)
                        put("state", state)
                    },
                )

            override fun close() = channel.close()
        }
    }
}
