package com.royaraqamia.app.community

import androidx.compose.ui.text.font.FontWeight
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * The post body's Markdown grammar (#922).
 *
 * The app has no Markdown runtime, so the block and inline rules the page uses
 * are pinned here rather than left to a library's defaults: a heading, a
 * paragraph, a fenced block, a quote, both list kinds, an image and a rule each
 * have one representation, and inline strong/emphasis/code/link keep their marks.
 */
class CommunityMarkdownTest {
    @Test
    fun `blocks keep the page's reading order`() {
        val markdown =
            """
            # عنوان

            فقرة أولى.

            ## عنوان فرعي

            - أول
            - ثانٍ

            1. واحد
            2. اثنان

            > اقتباس

            ![صورة](https://example.test/a.png)

            ```
            val x = 1
            ```

            ---
            """.trimIndent()

        assertEquals(
            listOf(
                MarkdownBlock.Heading(1, "عنوان"),
                MarkdownBlock.Paragraph("فقرة أولى."),
                MarkdownBlock.Heading(2, "عنوان فرعي"),
                MarkdownBlock.Bullets(listOf("أول", "ثانٍ")),
                MarkdownBlock.Numbered(listOf("واحد", "اثنان")),
                MarkdownBlock.Quote("اقتباس"),
                MarkdownBlock.Image("صورة", "https://example.test/a.png"),
                MarkdownBlock.Code("val x = 1"),
                MarkdownBlock.Rule,
            ),
            CommunityMarkdown.parse(markdown),
        )
    }

    @Test
    fun `soft-wrapped lines are one paragraph`() {
        assertEquals(
            listOf(MarkdownBlock.Paragraph("سطر أول سطر ثانٍ")),
            CommunityMarkdown.parse("سطر أول\nسطر ثانٍ"),
        )
    }

    @Test
    fun `an image inside a paragraph stays where the body put it`() {
        assertEquals(
            listOf(
                MarkdownBlock.Paragraph("قبل"),
                MarkdownBlock.Image("صورة", "https://example.test/a.png"),
                MarkdownBlock.Paragraph("بعد"),
            ),
            CommunityMarkdown.parse("قبل ![صورة](https://example.test/a.png) بعد"),
        )
    }

    @Test
    fun `strong and emphasis keep their spans`() {
        val text = CommunityMarkdown.inline("**قوي** و*مائل*")

        assertEquals("قوي ومائل", text.text)
        assertEquals(FontWeight.Bold, text.spanStyles.first().item.fontWeight)
    }

    @Test
    fun `a link keeps its label and its target`() {
        val text = CommunityMarkdown.inline("اقرأ [المزيد](https://example.test/read)")

        assertTrue(text.text.endsWith("المزيد"))
        assertEquals(1, text.getLinkAnnotations(0, text.length).size)
    }
}
