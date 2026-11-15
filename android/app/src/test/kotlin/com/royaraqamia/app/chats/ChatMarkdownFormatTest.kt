package com.royaraqamia.app.chats

import androidx.compose.ui.text.TextRange
import androidx.compose.ui.text.input.TextFieldValue
import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * The composer's marks are the site's marks (ADR-0193): these operators are what
 * `shared/text/chat-markdown.ts` parses, so an equal string is an equal message
 * on both clients.
 */
class ChatMarkdownFormatTest {
    private fun value(text: String, start: Int, end: Int) =
        TextFieldValue(text, TextRange(start, end))

    @Test
    fun `wraps the selection and keeps it selected`() {
        val result = toggleChatMark(value("مرحبا بالعالم", 6, 13), ChatMark.Bold)

        assertEquals("مرحبا **بالعالم**", result.text)
        assertEquals(TextRange(8, 15), result.selection)
    }

    @Test
    fun `pressing the same mark again unwraps it`() {
        val wrapped = toggleChatMark(value("مرحبا بالعالم", 6, 13), ChatMark.Bold)
        val again = toggleChatMark(wrapped, ChatMark.Bold)

        assertEquals("مرحبا بالعالم", again.text)
        assertEquals(TextRange(6, 13), again.selection)
    }

    @Test
    fun `drops markers that were selected along with the words`() {
        val result = toggleChatMark(value("**مرحبا**", 0, 11), ChatMark.Bold)

        assertEquals("مرحبا", result.text)
        assertEquals(TextRange(0, 5), result.selection)
    }

    @Test
    fun `an empty selection gets a pair with the caret between them`() {
        val result = toggleChatMark(value("مرحبا", 5, 5), ChatMark.Italic)

        assertEquals("مرحبا__", result.text)
        assertEquals(TextRange(6), result.selection)
    }

    @Test
    fun `underline and strike use their own operators`() {
        assertEquals("__x__", toggleChatMark(value("x", 0, 1), ChatMark.Underline).text)
        assertEquals("~~x~~", toggleChatMark(value("x", 0, 1), ChatMark.Strike).text)
        assertEquals("`x`", toggleChatMark(value("x", 0, 1), ChatMark.Code).text)
    }

    @Test
    fun `a link wraps the words and selects the address`() {
        val result = insertChatLink(value("اقرأ المقال", 5, 11))

        assertEquals("اقرأ [المقال](https://)", result.text)
        assertEquals("https://", result.text.substring(result.selection.min, result.selection.max))
    }
}
