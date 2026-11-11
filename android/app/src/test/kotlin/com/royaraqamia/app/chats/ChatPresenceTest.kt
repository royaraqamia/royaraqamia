package com.royaraqamia.app.chats

import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/**
 * The presence payload (ADR-0165): one state per member, named by the
 * conversation it belongs to, and never the member's own claim.
 */
class ChatPresenceTest {
    private fun payload(
        conversationId: String = "c-1",
        userId: String = "peer-1",
        state: String = "typing",
    ) = buildJsonObject {
        put("conversationId", conversationId)
        put("userId", userId)
        put("state", state)
    }

    @Test
    fun `reads a peer's typing and recording events`() {
        val typing = ChatPresence.eventOf(payload(), selfId = "me")
        assertEquals("c-1", typing?.conversationId)
        assertEquals("peer-1", typing?.userId)
        assertEquals(ChatPresenceState.Typing, typing?.presence)

        val recording = ChatPresence.eventOf(payload(state = "recording"), selfId = "me")
        assertEquals(ChatPresenceState.Recording, recording?.presence)
    }

    @Test
    fun `a stop is an event, but not a drawable state`() {
        val stop = ChatPresence.eventOf(payload(state = ChatPresence.STOP), selfId = "me")

        assertEquals(ChatPresence.STOP, stop?.state)
        assertNull(stop?.presence)
    }

    @Test
    fun `drops the caller's own claim and anything malformed`() {
        assertNull(ChatPresence.eventOf(payload(userId = "me"), selfId = "me"))
        assertNull(ChatPresence.eventOf(payload(conversationId = ""), selfId = "me"))
        assertNull(ChatPresence.eventOf(payload(state = "idle"), selfId = "me"))
        assertNull(ChatPresence.eventOf(buildJsonObject { put("state", "typing") }, selfId = "me"))
    }
}
