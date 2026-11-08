package com.royaraqamia.app.realtime

import com.royaraqamia.app.chats.ChatRealtime
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * The Phoenix wire, with no socket (ADR-0141): what the client sends, and what
 * it understands when the server answers. The topic, the table, the filter and
 * the token are the facts a refused subscription is diagnosed from.
 */
class RealtimeProtocolTest {
    private val json = Json { ignoreUnknownKeys = true }

    @Test
    fun `a join carries the wire topic, the table, the filter and the token`() {
        val wire =
            RealtimeProtocol.join(
                ChatRealtime.threadSpec("c-1"),
                accessToken = "access-1",
                ref = "1",
            )
        val frame = json.parseToJsonElement(wire).jsonObject

        assertEquals("realtime:chat-thread:c-1", frame["topic"]!!.jsonPrimitive.content)
        assertEquals("phx_join", frame["event"]!!.jsonPrimitive.content)
        assertEquals("1", frame["ref"]!!.jsonPrimitive.content)
        assertEquals("the join carries its join_ref", "1", frame["join_ref"]!!.jsonPrimitive.content)

        val payload = frame["payload"]!!.jsonObject
        assertEquals("access-1", payload["access_token"]!!.jsonPrimitive.content)
        val change =
            payload["config"]!!
                .jsonObject["postgres_changes"]!!
                .let { it as kotlinx.serialization.json.JsonArray }
                .single()
                .jsonObject
        assertEquals("chat_messages", change["table"]!!.jsonPrimitive.content)
        assertEquals("public", change["schema"]!!.jsonPrimitive.content)
        assertEquals("conversation_id=eq.c-1", change["filter"]!!.jsonPrimitive.content)
    }

    @Test
    fun `the typing topic joins private so realtime messages rls decides who may listen`() {
        val wire =
            RealtimeProtocol.join(
                ChatRealtime.typingSpec("c-1"),
                accessToken = "access-1",
                ref = "2",
            )
        val config =
            json.parseToJsonElement(wire)
                .jsonObject["payload"]!!
                .jsonObject["config"]!!
                .jsonObject

        assertEquals(true, config["private"]!!.jsonPrimitive.content.toBoolean())
        val events = (config["broadcast"]!!.jsonObject["events"] as kotlinx.serialization.json.JsonArray)
            .map { it.jsonPrimitive.content }
        assertEquals(listOf("typing", "stop"), events)
    }

    @Test
    fun `a refused reply is read with its reason`() {
        val incoming =
            RealtimeProtocol.parse(
                """{"topic":"realtime:chat-thread:c-1","event":"phx_reply","ref":"1","payload":{"status":"error","response":{"reason":"unauthorized"}}}"""
            )

        val reply = incoming as RealtimeProtocol.Incoming.Reply
        assertEquals(false, reply.ok)
        assertEquals("unauthorized", reply.reason)
        assertEquals("realtime:chat-thread:c-1", reply.topic)
    }

    @Test
    fun `a postgres change is a hint, and a broadcast keeps its payload`() {
        val change =
            RealtimeProtocol.parse(
                """{"topic":"realtime:chat-thread:c-1","event":"postgres_changes","payload":{"data":{}}}"""
            )
        assertEquals(
            "realtime:chat-thread:c-1",
            (change as RealtimeProtocol.Incoming.Change).topic,
        )

        val broadcast =
            RealtimeProtocol.parse(
                """{"topic":"realtime:chat:c-1","event":"typing","payload":{"userId":"peer-1"}}"""
            )
        val message = broadcast as RealtimeProtocol.Incoming.Broadcast
        assertEquals("typing", message.event)
        assertEquals("peer-1", message.payload["userId"]!!.jsonPrimitive.content)
    }

    @Test
    fun `a heartbeat is the phoenix topic`() {
        val frame = json.parseToJsonElement(RealtimeProtocol.heartbeat("9")).jsonObject
        assertEquals("phoenix", frame["topic"]!!.jsonPrimitive.content)
        assertEquals("heartbeat", frame["event"]!!.jsonPrimitive.content)
        assertNotNull(frame["payload"])
    }
}
