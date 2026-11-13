package com.royaraqamia.app.community

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
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
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
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
import androidx.compose.ui.text.style.LineHeightStyle
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.withLink
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import com.royaraqamia.app.theme.LocalRoySpacing
import com.royaraqamia.app.theme.LocalRoyTypeScale
import com.royaraqamia.app.theme.RoyColors
import com.royaraqamia.app.theme.RoyTypeScale

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

    // The page's prose rhythm at the phone width (#1351): the heading's `mt-12`,
    // `pb-3` and border, the paragraph's 16/26 line box, and the list's 18/32
    // rows with their 12px leading. The margins collapse the way the page's do,
    // so the body's own box is the same height on both clients and the raster
    // compares the nodes rather than the spacing.
    Column(modifier = modifier.fillMaxWidth()) {
        var previousAfter: Dp? = null
        blocks.forEachIndexed { index, block ->
            val before =
                if (index == 0) firstMarginBefore(block)
                else maxOf(previousAfter ?: 0.dp, marginBefore(block))
            if (before > 0.dp) Spacer(Modifier.height(before))

            when (block) {
                is MarkdownBlock.Heading -> {
                    // The page's `text-2xl` line box is 32px; Compose reports the
                    // font's natural 36.36 for a one-line 24px heading, so a
                    // single-line h2 pins the page's height. A heading that wraps
                    // keeps its natural height rather than being clipped.
                    var lines by remember(block.text, block.level) { mutableStateOf(1) }
                    val pinHeight = block.level <= 2 && lines == 1
                    Text(
                        text = CommunityMarkdown.inline(block.text),
                        style = headingStyle(block.level, type),
                        color = RoyColors.foreground,
                        onTextLayout = { lines = it.lineCount },
                        modifier = if (pinHeight) Modifier.height(32.dp) else Modifier,
                    )
                    if (block.level <= 2) {
                        Spacer(Modifier.height(12.dp))
                        HorizontalDivider(
                            color = RoyColors.border.copy(alpha = 0.4f),
                            thickness = 1.dp,
                        )
                    }
                }

                is MarkdownBlock.Paragraph ->
                    Text(
                        text = CommunityMarkdown.inline(block.text),
                        style =
                            type.body.copy(
                                fontSize = 16.sp,
                                lineHeight = 26.sp,
                                lineHeightStyle = BODY_LINE_HEIGHT,
                            ),
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
                    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                        block.items.forEach { item -> ListRow(marker = "•", text = item) }
                    }

                is MarkdownBlock.Numbered ->
                    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
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

            previousAfter = marginAfter(block)
        }

        previousAfter?.let { if (it > 0.dp) Spacer(Modifier.height(it)) }
    }
}

/** The page's list item: an 18/32 row with the marker in the flow. */
@Composable
private fun ListRow(marker: String, text: String) {
    val spacing = LocalRoySpacing.current

    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(spacing.elementGapSm),
    ) {
        Text(
            text = marker,
            style = listStyle(),
            color = RoyColors.mutedForeground,
        )
        Text(
            text = CommunityMarkdown.inline(text),
            style = listStyle(),
            color = RoyColors.foreground.copy(alpha = 0.9f),
            modifier = Modifier.weight(1f),
        )
    }
}

@Composable
private fun listStyle(): TextStyle =
    LocalRoyTypeScale.current.body.copy(
        fontSize = 18.sp,
        lineHeight = 32.sp,
        lineHeightStyle = BODY_LINE_HEIGHT,
    )

private fun headingStyle(level: Int, type: RoyTypeScale): TextStyle =
    when {
        level <= 2 ->
            type.h2.copy(
                fontSize = 24.sp,
                lineHeight = 32.sp,
                lineHeightStyle = BODY_LINE_HEIGHT,
                fontWeight = FontWeight.Bold,
            )
        level == 3 ->
            type.h3.copy(
                fontSize = 20.sp,
                lineHeight = 28.sp,
                lineHeightStyle = BODY_LINE_HEIGHT,
                fontWeight = FontWeight.Bold,
            )
        else ->
            type.h4.copy(
                fontSize = 18.sp,
                lineHeight = 26.sp,
                lineHeightStyle = BODY_LINE_HEIGHT,
                fontWeight = FontWeight.Bold,
            )
    }

private val BODY_LINE_HEIGHT =
    LineHeightStyle(
        alignment = LineHeightStyle.Alignment.Center,
        trim = LineHeightStyle.Trim.None,
    )


/** The prose margin above a block when it opens the body. */
private fun firstMarginBefore(block: MarkdownBlock): Dp =
    if (block is MarkdownBlock.Heading && block.level <= 2) 48.dp else 0.dp

/** The prose margin above a block, its CSS `margin-top`. */
private fun marginBefore(block: MarkdownBlock): Dp =
    when (block) {
        is MarkdownBlock.Heading -> if (block.level <= 2) 48.dp else 24.dp
        else -> 24.dp
    }

/** The prose margin below a block, its CSS `margin-bottom` (and the list's leading). */
private fun marginAfter(block: MarkdownBlock): Dp =
    when (block) {
        is MarkdownBlock.Bullets, is MarkdownBlock.Numbered -> 12.dp
        else -> 24.dp
    }
