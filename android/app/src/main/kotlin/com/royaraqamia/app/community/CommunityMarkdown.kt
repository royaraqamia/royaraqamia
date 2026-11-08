package com.royaraqamia.app.community

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.LinkAnnotation
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.TextLinkStyles
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.withLink
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import coil.compose.AsyncImage
import com.royaraqamia.app.theme.LocalRoySpacing
import com.royaraqamia.app.theme.LocalRoyTypeScale
import com.royaraqamia.app.theme.RoyColors

/**
 * The subset of Markdown the community post page renders (#922).
 *
 * The site draws a post body with `react-markdown` + `remark-gfm`; the app has no
 * Markdown runtime and does not gain a dependency for one, so this is the same
 * block and inline grammar the page relies on: headings, paragraphs, fenced code,
 * block quotes, ordered and unordered lists, a horizontal rule, images, and the
 * inline strong/emphasis/strikethrough/code/link forms. Raw HTML is not rendered
 * on the page either (react-markdown escapes it), so it is shown as text here.
 *
 * The parser is pure and tested by [CommunityMarkdownTest]; the composable only
 * turns its blocks into Compose. Digits are never touched, and the whole tree is
 * laid out RTL by the shell, so Arabic body text needs no attribute here that the
 * page sets.
 */
sealed interface MarkdownBlock {
    data class Heading(val level: Int, val text: String) : MarkdownBlock

    data class Paragraph(val text: String) : MarkdownBlock

    data class Image(val alt: String, val url: String) : MarkdownBlock

    data class Code(val text: String) : MarkdownBlock

    data class Quote(val text: String) : MarkdownBlock

    data class Bullets(val items: List<String>) : MarkdownBlock

    data class Numbered(val items: List<String>) : MarkdownBlock

    data object Rule : MarkdownBlock
}

object CommunityMarkdown {
    private val heading = Regex("^(#{1,6})\\s+(.+)$")
    private val rule = Regex("^([-*_])(?:\\s*\\1){2,}$")
    private val bullet = Regex("^\\s*[-*+]\\s+(.*)$")
    private val numbered = Regex("^\\s*\\d+[.)]\\s+(.*)$")
    private val imageOnly = Regex("^!\\[([^\\]]*)\\]\\(([^)\\s]+)(?:\\s+\"[^\"]*\")?\\)$")
    private val inlineImage = Regex("!\\[([^\\]]*)\\]\\(([^)\\s]+)(?:\\s+\"[^\"]*\")?\\)")

    /** A Markdown body as the blocks the screen draws. */
    fun parse(markdown: String): List<MarkdownBlock> {
        val lines = markdown.replace("\r\n", "\n").replace('\r', '\n').split('\n')
        val blocks = mutableListOf<MarkdownBlock>()
        val paragraph = mutableListOf<String>()
        var index = 0

        fun flushParagraph() {
            if (paragraph.isEmpty()) return
            val text = paragraph.joinToString(" ").trim()
            paragraph.clear()
            if (text.isEmpty()) return
            blocks += paragraphWithImages(text)
        }

        while (index < lines.size) {
            val line = lines[index]
            val trimmed = line.trim()

            when {
                trimmed.isEmpty() -> {
                    flushParagraph()
                    index += 1
                }

                trimmed.startsWith("```") -> {
                    flushParagraph()
                    index += 1
                    val code = StringBuilder()
                    while (index < lines.size && !lines[index].trim().startsWith("```")) {
                        if (code.isNotEmpty()) code.append('\n')
                        code.append(lines[index])
                        index += 1
                    }
                    if (index < lines.size) index += 1
                    blocks += MarkdownBlock.Code(code.toString())
                }

                heading.matches(trimmed) -> {
                    flushParagraph()
                    val match = heading.find(trimmed) ?: continue
                    blocks += MarkdownBlock.Heading(match.groupValues[1].length, match.groupValues[2].trim())
                    index += 1
                }

                rule.matches(trimmed) -> {
                    flushParagraph()
                    blocks += MarkdownBlock.Rule
                    index += 1
                }

                imageOnly.matches(trimmed) -> {
                    flushParagraph()
                    val match = imageOnly.find(trimmed) ?: continue
                    blocks += MarkdownBlock.Image(match.groupValues[1], match.groupValues[2])
                    index += 1
                }

                trimmed.startsWith(">") -> {
                    flushParagraph()
                    val quote = mutableListOf<String>()
                    while (index < lines.size && lines[index].trim().startsWith(">")) {
                        quote += lines[index].trim().removePrefix(">").removePrefix(" ")
                        index += 1
                    }
                    blocks += MarkdownBlock.Quote(quote.joinToString("\n"))
                }

                bullet.matches(line) -> {
                    flushParagraph()
                    val items = mutableListOf<String>()
                    while (index < lines.size) {
                        val match = bullet.find(lines[index]) ?: break
                        items += match.groupValues[1].trim()
                        index += 1
                    }
                    blocks += MarkdownBlock.Bullets(items)
                }

                numbered.matches(line) -> {
                    flushParagraph()
                    val items = mutableListOf<String>()
                    while (index < lines.size) {
                        val match = numbered.find(lines[index]) ?: break
                        items += match.groupValues[1].trim()
                        index += 1
                    }
                    blocks += MarkdownBlock.Numbered(items)
                }

                else -> {
                    paragraph += trimmed
                    index += 1
                }
            }
        }

        flushParagraph()
        return blocks
    }

    /**
     * One line of inline Markdown as styled text: strong, emphasis,
     * strikethrough, inline code and links. The link style is the page's primary
     * colour; tapping it opens the URL through Compose's own annotation.
     */
    fun inline(text: String): AnnotatedString =
        buildAnnotatedString { appendInline(this, text) }

    /**
     * A paragraph that carries an image becomes the text around it plus the image
     * in reading order: Compose cannot place an `AsyncImage` inside an
     * `AnnotatedString`, and the page renders the picture where the Markdown put
     * it.
     */
    private fun paragraphWithImages(text: String): List<MarkdownBlock> {
        val matches = inlineImage.findAll(text).toList()
        if (matches.isEmpty()) return listOf(MarkdownBlock.Paragraph(text))

        val blocks = mutableListOf<MarkdownBlock>()
        var cursor = 0
        for (match in matches) {
            val before = text.substring(cursor, match.range.first).trim()
            if (before.isNotEmpty()) blocks += MarkdownBlock.Paragraph(before)
            blocks += MarkdownBlock.Image(match.groupValues[1], match.groupValues[2])
            cursor = match.range.last + 1
        }
        val after = text.substring(cursor).trim()
        if (after.isNotEmpty()) blocks += MarkdownBlock.Paragraph(after)
        return blocks
    }

    private fun appendInline(builder: AnnotatedString.Builder, text: String) {
        val plain = StringBuilder()
        var index = 0

        fun flushPlain() {
            if (plain.isEmpty()) return
            builder.append(plain.toString())
            plain.clear()
        }

        while (index < text.length) {
            val character = text[index]

            when {
                character == '\\' && index + 1 < text.length -> {
                    plain.append(text[index + 1])
                    index += 2
                }

                character == '`' -> {
                    val end = text.indexOf('`', index + 1)
                    if (end < 0) {
                        plain.append(character)
                        index += 1
                    } else {
                        flushPlain()
                        builder.withStyle(INLINE_CODE) { append(text.substring(index + 1, end)) }
                        index = end + 1
                    }
                }

                text.startsWith("![", index) -> {
                    val parsed = parseLink(text, index, image = true)
                    if (parsed == null) {
                        plain.append(character)
                        index += 1
                    } else {
                        flushPlain()
                        builder.append(parsed.label)
                        index = parsed.end
                    }
                }

                character == '[' -> {
                    val parsed = parseLink(text, index, image = false)
                    if (parsed == null) {
                        plain.append(character)
                        index += 1
                    } else {
                        flushPlain()
                        builder.withLink(LinkAnnotation.Url(url = parsed.target, styles = LINK)) {
                            append(parsed.label)
                        }
                        index = parsed.end
                    }
                }

                text.startsWith("**", index) || text.startsWith("__", index) -> {
                    val marker = text.substring(index, index + 2)
                    val end = text.indexOf(marker, index + 2)
                    if (end < 0) {
                        plain.append(character)
                        index += 1
                    } else {
                        flushPlain()
                        builder.withStyle(BOLD) {
                            appendInline(this, text.substring(index + 2, end))
                        }
                        index = end + 2
                    }
                }

                text.startsWith("~~", index) -> {
                    val end = text.indexOf("~~", index + 2)
                    if (end < 0) {
                        plain.append(character)
                        index += 1
                    } else {
                        flushPlain()
                        builder.withStyle(STRIKE) {
                            appendInline(this, text.substring(index + 2, end))
                        }
                        index = end + 2
                    }
                }

                character == '*' || character == '_' -> {
                    val end = text.indexOf(character, index + 1)
                    if (end < 0) {
                        plain.append(character)
                        index += 1
                    } else {
                        flushPlain()
                        builder.withStyle(ITALIC) {
                            appendInline(this, text.substring(index + 1, end))
                        }
                        index = end + 1
                    }
                }

                else -> {
                    plain.append(character)
                    index += 1
                }
            }
        }

        flushPlain()
    }

    private data class ParsedLink(val label: String, val target: String, val end: Int)

    private fun parseLink(text: String, start: Int, image: Boolean): ParsedLink? {
        val labelStart = start + if (image) 2 else 1
        val labelEnd = text.indexOf(']', labelStart)
        if (labelEnd < 0 || labelEnd + 1 >= text.length || text[labelEnd + 1] != '(') return null
        val targetEnd = text.indexOf(')', labelEnd + 2)
        if (targetEnd < 0) return null
        val target = text.substring(labelEnd + 2, targetEnd).trim().substringBefore(' ')
        if (target.isEmpty()) return null
        return ParsedLink(text.substring(labelStart, labelEnd), target, targetEnd + 1)
    }

    private val BOLD = SpanStyle(fontWeight = FontWeight.Bold)

    private val ITALIC = SpanStyle(fontStyle = FontStyle.Italic)

    private val STRIKE = SpanStyle(textDecoration = TextDecoration.LineThrough)

    private val INLINE_CODE =
        SpanStyle(
            fontFamily = FontFamily.Monospace,
            background = RoyColors.muted,
            color = RoyColors.foreground,
        )

    private val LINK =
        TextLinkStyles(
            style = SpanStyle(color = RoyColors.primary, textDecoration = TextDecoration.Underline)
        )
}

/** The blocks a post body contains, drawn at the page's reading rhythm. */
@Composable
fun MarkdownBody(blocks: List<MarkdownBlock>, modifier: Modifier = Modifier) {
    val type = LocalRoyTypeScale.current
    val spacing = LocalRoySpacing.current

    Column(modifier = modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(spacing.elementGap)) {
        blocks.forEach { block ->
            when (block) {
                is MarkdownBlock.Heading ->
                    Text(
                        text = CommunityMarkdown.inline(block.text),
                        style = headingStyle(block.level, type.h2, type.h3, type.h4),
                        color = RoyColors.foreground,
                        modifier = Modifier.padding(top = if (block.level <= 2) spacing.elementGapSm else 0.dp),
                    )

                is MarkdownBlock.Paragraph ->
                    Text(
                        text = CommunityMarkdown.inline(block.text),
                        style = type.body.copy(lineHeight = type.body.fontSize * 1.7f),
                        color = RoyColors.foreground.copy(alpha = 0.9f),
                    )

                is MarkdownBlock.Image ->
                    AsyncImage(
                        model = block.url,
                        contentDescription = block.alt.ifBlank { null },
                        contentScale = ContentScale.FillWidth,
                        modifier =
                            Modifier.fillMaxWidth()
                                .clip(RoundedCornerShape(16.dp))
                                .background(RoyColors.muted.copy(alpha = 0.6f)),
                    )

                is MarkdownBlock.Code ->
                    Box(
                        modifier =
                            Modifier.fillMaxWidth()
                                .clip(RoundedCornerShape(16.dp))
                                .background(RoyColors.muted.copy(alpha = 0.9f))
                                .horizontalScroll(rememberScrollState())
                                .padding(spacing.elementGapSm),
                    ) {
                        Text(
                            text = block.text,
                            style = type.small.copy(fontFamily = FontFamily.Monospace),
                            color = RoyColors.foreground,
                        )
                    }

                is MarkdownBlock.Quote ->
                    Row(
                        modifier =
                            Modifier.fillMaxWidth()
                                .height(IntrinsicSize.Min)
                                .clip(RoundedCornerShape(topEnd = 16.dp, bottomEnd = 16.dp))
                                .background(RoyColors.muted.copy(alpha = 0.3f)),
                    ) {
                        Box(
                            Modifier
                                .width(4.dp)
                                .fillMaxHeight()
                                .background(RoyColors.primary),
                        )
                        Text(
                            text = CommunityMarkdown.inline(block.text),
                            style = type.body,
                            color = RoyColors.foreground.copy(alpha = 0.9f),
                            modifier =
                                Modifier.padding(
                                    horizontal = spacing.elementGapSm,
                                    vertical = spacing.elementGapSm,
                                ),
                        )
                    }

                is MarkdownBlock.Bullets ->
                    Column(verticalArrangement = Arrangement.spacedBy(spacing.elementGapSm / 2)) {
                        block.items.forEach { item -> ListRow(marker = "•", text = item) }
                    }

                is MarkdownBlock.Numbered ->
                    Column(verticalArrangement = Arrangement.spacedBy(spacing.elementGapSm / 2)) {
                        block.items.forEachIndexed { position, item ->
                            ListRow(marker = "${position + 1}.", text = item)
                        }
                    }

                MarkdownBlock.Rule ->
                    HorizontalDivider(
                        color = RoyColors.border.copy(alpha = 0.5f),
                        modifier = Modifier.padding(vertical = spacing.elementGapSm),
                    )
            }
        }
    }
}

@Composable
private fun ListRow(marker: String, text: String) {
    val type = LocalRoyTypeScale.current
    val spacing = LocalRoySpacing.current

    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(spacing.elementGapSm),
    ) {
        Text(text = marker, style = type.body, color = RoyColors.mutedForeground)
        Text(
            text = CommunityMarkdown.inline(text),
            style = type.body,
            color = RoyColors.foreground.copy(alpha = 0.9f),
            modifier = Modifier.weight(1f),
        )
    }
}

private fun headingStyle(
    level: Int,
    h2: TextStyle,
    h3: TextStyle,
    h4: TextStyle,
): TextStyle =
    when (level) {
        1 -> h2.copy(fontWeight = FontWeight.Bold)
        2 -> h2.copy(fontWeight = FontWeight.Bold)
        3 -> h3.copy(fontWeight = FontWeight.Bold)
        else -> h4.copy(fontWeight = FontWeight.Bold)
    }

