package com.royaraqamia.app.assistant

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/**
 * The assistant turn's frames (ADR-0143).
 *
 * The parser is the half of the streamed route a JVM test can prove without a
 * socket: the route's own shapes, a frame it does not know, and the garbage a
 * dropped connection can leave in the buffer. A frame it cannot read is skipped,
 * never a crash that costs the conversation.
 */
class AssistantEventTest {
    @Test
    fun `a delta carries the text as written`() {
        assertEquals(
            AssistantEvent.Delta("أهلاً"),
            parseAssistantEvent("""{"type":"delta","text":"أهلاً"}"""),
        )
    }

    @Test
    fun `a tool carries its label`() {
        assertEquals(
            AssistantEvent.Tool("قرأت شهاداتك"),
            parseAssistantEvent("""{"type":"tool","name":"list_certificates","label":"قرأت شهاداتك"}"""),
        )
    }

    @Test
    fun `a proposal names the tool it wants to run`() {
        assertEquals(
            AssistantEvent.Proposal("create_habit"),
            parseAssistantEvent(
                """{"type":"proposal","message":{},"action":{"tool":"create_habit","args":{}}}"""
            ),
        )
    }

    @Test
    fun `the ending and the refusal are single frames`() {
        assertEquals(AssistantEvent.Done, parseAssistantEvent("""{"type":"done"}"""))
        assertEquals(
            AssistantEvent.Error("تعذّر الحصول على ردّ من نور."),
            parseAssistantEvent("""{"type":"error","error":"تعذّر الحصول على ردّ من نور."}"""),
        )
    }

    @Test
    fun `a frame the app does not know is dropped`() {
        assertNull(parseAssistantEvent("""{"type":"thinking","text":"..."}"""))
        assertNull(parseAssistantEvent("""{"type":"done"    """))
        assertNull(parseAssistantEvent("not json at all"))
    }

    @Test
    fun `a missing field leaves an empty sentence rather than throwing`() {
        assertEquals(AssistantEvent.Delta(""), parseAssistantEvent("""{"type":"delta"}"""))
        assertEquals(AssistantEvent.Tool(""), parseAssistantEvent("""{"type":"tool"}"""))
    }
}
