package com.royaraqamia.app.realtime

import com.royaraqamia.app.chats.ChatRealtime
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
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
    fun `the presence topic joins private so realtime messages rls decides who may listen`() {
        val wire =
            RealtimeProtocol.join(
                ChatRealtime.presenceSpec("c-1"),
                accessToken = "access-1",
                ref = "2",
            )
        val config =
            json.parseToJsonElement(wire)
                .jsonObject["payload"]!!
                .jsonObject["config"]!!
                .jsonObject

        assertEquals(
            "realtime:presence:c-1",
            json.parseToJsonElement(wire).jsonObject["topic"]!!.jsonPrimitive.content,
        )
        assertEquals(true, config["private"]!!.jsonPrimitive.content.toBoolean())
        val events =
            (config["broadcast"]!!.jsonObject["events"] as kotlinx.serialization.json.JsonArray)
                .map { it.jsonPrimitive.content }
        assertEquals(listOf("presence"), events)
    }

    @Test
    fun `a push names the join it belongs to`() {
        val wire =
            RealtimeProtocol.push(
                joinRef = "2",
                topic = "presence:c-1",
                event = "presence",
                payload = buildJsonObject { put("state", "typing") },
                ref = "7",
            )
        val frame = json.parseToJsonElement(wire).jsonObject

        assertEquals("realtime:presence:c-1", frame["topic"]!!.jsonPrimitive.content)
        assertEquals("presence", frame["event"]!!.jsonPrimitive.content)
        assertEquals("7", frame["ref"]!!.jsonPrimitive.content)
        assertEquals("2", frame["join_ref"]!!.jsonPrimitive.content)
        assertEquals("typing", frame["payload"]!!.jsonObject["state"]!!.jsonPrimitive.content)
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
                """{"topic":"realtime:presence:me","event":"presence","payload":{"conversationId":"c-1","state":"typing"}}"""
            )
        val message = broadcast as RealtimeProtocol.Incoming.Broadcast
        assertEquals("presence", message.event)
        assertEquals("c-1", message.payload["conversationId"]!!.jsonPrimitive.content)
    }

    @Test
    fun `a heartbeat is the phoenix topic`() {
        val frame = json.parseToJsonElement(RealtimeProtocol.heartbeat("9")).jsonObject
        assertEquals("phoenix", frame["topic"]!!.jsonPrimitive.content)
        assertEquals("heartbeat", frame["event"]!!.jsonPrimitive.content)
        assertNotNull(frame["payload"])
    }
}
