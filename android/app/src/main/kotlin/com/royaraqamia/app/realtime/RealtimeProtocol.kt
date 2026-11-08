package com.royaraqamia.app.realtime

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

/**
 * What one Realtime channel asks the server to stream (ADR-0060, ADR-0141).
 *
 * The topic is the app's own name (`chat-thread:<uuid>`); [RealtimeProtocol]
 * adds the `realtime:` prefix the Phoenix wire uses. A channel is a **hint**
 * source: the payload that arrives says a row changed, never what the row is,
 * and the subscriber answers with the pull it already has.
 */
data class RealtimeChannelSpec(
    /** The app's topic, e.g. `chat-thread:<conversation id>`. */
    val topic: String,
    /** `postgres_changes` bindings, each `{event:"*", schema:"public", table, filter}`. */
    val postgresChanges: List<PostgresChange> = emptyList(),
    /** Broadcast event names to receive, on a private topic. */
    val broadcasts: Set<String> = emptySet(),
    /**
     * Whether this is a **private** topic. A private topic is authorised by the
     * policies on `realtime.messages` when the channel joins
     * (`20261110090000_chat_typing_channel.sql`), so the name is not the
     * boundary — the membership is (ADR-0116).
     */
    val isPrivate: Boolean = false,
)

/** One table binding inside a channel's `config.postgres_changes`. */
data class PostgresChange(val table: String, val filter: String? = null)

/** What a subscribed channel reports to its screen. */
sealed interface RealtimeEvent {
    /** The channel joined; its hints will now arrive. */
    data class Ready(val topic: String) : RealtimeEvent

    /** A row changed. The payload is deliberately absent: this means "pull". */
    data class Hint(val topic: String) : RealtimeEvent

    /** A broadcast event on a private topic (e.g. the chat typing channel). */
    data class Broadcast(
        val topic: String,
        val event: String,
        val payload: JsonObject,
    ) : RealtimeEvent

    /** The server refused this topic, named so it is never silently absent. */
    data class Refused(val topic: String, val reason: String) : RealtimeEvent
}

/**
 * The Phoenix v1 messages the Realtime socket speaks (ADR-0141).
 *
 * Pure: no socket, no clock, no session. Everything the transport needs to send
 * is built here and everything it receives is read here, so the wire shape can
 * be tested without a server — which is the only way the app's one socket can be
 * trusted on a JVM.
 */
object RealtimeProtocol {
    /** Realtime names every channel `realtime:<topic>` on the wire. */
    const val WIRE_PREFIX = "realtime:"

    private val json = Json { ignoreUnknownKeys = true; explicitNulls = false }

    fun wireTopic(topic: String): String =
        if (topic.startsWith(WIRE_PREFIX)) topic else WIRE_PREFIX + topic

    /** `phx_join` for one channel, with the session's access token. */
    fun join(
        spec: RealtimeChannelSpec,
        accessToken: String?,
        ref: String,
    ): String =
        buildJsonObject {
                put("topic", wireTopic(spec.topic))
                put("event", "phx_join")
                put(
                    "payload",
                    buildJsonObject {
                        put(
                            "config",
                            buildJsonObject {
                                if (spec.postgresChanges.isNotEmpty()) {
                                    put(
                                        "postgres_changes",
                                        buildJsonArray {
                                            spec.postgresChanges.forEach { change ->
                                                add(
                                                    buildJsonObject {
                                                        put("event", "*")
                                                        put("schema", "public")
                                                        put("table", change.table)
                                                        change.filter?.let { put("filter", it) }
                                                    }
                                                )
                                            }
                                        },
                                    )
                                }
                                if (spec.broadcasts.isNotEmpty()) {
                                    put(
                                        "broadcast",
                                        buildJsonObject {
                                            put("self", false)
                                            put(
                                                "events",
                                                buildJsonArray {
                                                    spec.broadcasts.forEach { add(JsonPrimitive(it)) }
                                                },
                                            )
                                        },
                                    )
                                }
                                if (spec.isPrivate) put("private", true)
                            },
                        )
                        accessToken?.let { put("access_token", it) }
                    },
                )
                put("ref", ref)
                // Protocol 1.0.0 marks `phx_join` as requiring both refs; the
                // server echoes `ref` in the reply, and `join_ref` names the
                // joined topic a later push belongs to.
                put("join_ref", ref)
            }
            .toString()

    /** The Phoenix heartbeat: the socket's liveness, once every window. */
    fun heartbeat(ref: String): String =
        buildJsonObject {
                put("topic", "phoenix")
                put("event", "heartbeat")
                put("payload", JsonObject(emptyMap()))
                put("ref", ref)
            }
            .toString()

    /** One message the server pushed, or `null` when it carries nothing this client uses. */
    fun parse(text: String): Incoming? {
        val root =
            try {
                json.parseToJsonElement(text) as? JsonObject
            } catch (_: Exception) {
                null
            } ?: return null

        val topic = root.string("topic")
        val event = root.string("event") ?: return null
        val ref = root.string("ref")

        return when (event) {
            "phx_reply" -> {
                val payload = root.objectOrEmpty("payload")
                val ok = payload.string("status") == "ok"
                val reason = payload.objectOrNull("response")?.string("reason")
                Incoming.Reply(topic = topic, ref = ref, ok = ok, reason = reason)
            }

            "postgres_changes" -> topic?.let { Incoming.Change(it) }

            "phx_error", "phx_close" -> {
                val reason =
                    root.objectOrEmpty("payload").string("reason")
                        ?: if (event == "phx_close") "the channel closed" else "the server refused the channel"
                topic?.let { Incoming.Error(it, reason) }
            }

            "presence_diff", "presence_state", "system" -> null

            else -> {
                // supabase-js may wrap a broadcast as `event:"broadcast"` with the
                // real event inside `payload`; accept both wire shapes.
                val payload = root.objectOrEmpty("payload")
                if (event == "broadcast") {
                    val inner = payload.string("event")
                    if (topic != null && inner != null) {
                        Incoming.Broadcast(topic, inner, payload.objectOrEmpty("payload"))
                    } else {
                        null
                    }
                } else if (topic != null) {
                    Incoming.Broadcast(topic, event, payload)
                } else {
                    null
                }
            }
        }
    }

    /** What [parse] understood. */
    sealed interface Incoming {
        data class Reply(
            val topic: String?,
            val ref: String?,
            val ok: Boolean,
            val reason: String?,
        ) : Incoming

        data class Change(val topic: String) : Incoming

        data class Broadcast(
            val topic: String,
            val event: String,
            val payload: JsonObject,
        ) : Incoming

        data class Error(val topic: String, val reason: String) : Incoming
    }

    private fun JsonObject.string(key: String): String? = (get(key) as? JsonPrimitive)?.takeIf { it !is JsonNull }?.content

    private fun JsonObject.objectOrNull(key: String): JsonObject? = get(key) as? JsonObject

    private fun JsonObject.objectOrEmpty(key: String): JsonObject = objectOrNull(key) ?: JsonObject(emptyMap())
}
