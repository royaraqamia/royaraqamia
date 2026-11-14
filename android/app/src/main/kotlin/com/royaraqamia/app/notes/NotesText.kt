package com.royaraqamia.app.notes

import java.time.Instant
import java.time.ZoneId
import java.time.ZonedDateTime
import java.time.format.DateTimeFormatter

/**
 * The plain-text projection of a note's Markdown, and the search form (#1390).
 *
 * Mirrors `frontend/shared/notes/text.ts`: the list never renders Markdown as
 * HTML — a one-line name and a two-line preview are all it needs — so this is a
 * stripper, not a parser.
 */
object NotesText {
    private val image = Regex("!\\[([^\\]]*)\\]\\([^)]*\\)")
    private val link = Regex("\\[([^\\]]*)\\]\\([^)]*\\)")
    private val fence = Regex("^(\\s*)(```|~~~)[^\\n]*$", RegexOption.MULTILINE)
    private val heading = Regex("^\\s{0,3}#{1,6}\\s+", RegexOption.MULTILINE)
    private val blockquote = Regex("^\\s{0,3}>\\s?", RegexOption.MULTILINE)
    private val listMarker = Regex("^\\s{0,3}(?:[-*+]|\\d+[.)])\\s+", RegexOption.MULTILINE)
    private val rule = Regex("^\\s{0,3}(?:[-*_]\\s*){3,}$", RegexOption.MULTILINE)
    private val emphasis = Regex("(\\*\\*|__|\\*|_|~~|`)")

    fun plainText(markdown: String): String =
        markdown
            .replace(fence, "")
            .replace(image, "$1")
            .replace(link, "$1")
            .replace(heading, "")
            .replace(blockquote, "")
            .replace(listMarker, "")
            .replace(rule, "")
            .replace(emphasis, "")
            .replace(Regex("\\s+"), " ")
            .trim()

    /** The first line that says something: the name the list shows a note under. */
    fun noteName(body: String, max: Int = 120): String {
        for (line in body.split('\n')) {
            val text = plainText(line)
            if (text.isEmpty()) continue
            return if (text.length > max) text.take(max).trimEnd() + "…" else text
        }
        return ""
    }

    /** The two-line preview under the name — the rest of the body. */
    fun notePreview(body: String, max: Int = 160): String {
        val lines = body.split('\n')
        val first = lines.indexOfFirst { plainText(it).isNotEmpty() }
        if (first == -1) return ""
        val text = plainText(lines.drop(first + 1).joinToString("\n"))
        return if (text.length <= max) text else text.take(max).trimEnd() + "…"
    }

    /** The comparison form: diacritics, tatweel and the alef/ya variants folded. */
    fun normalizeForSearch(value: String): String =
        value
            .lowercase()
            .replace(Regex("[\\u064B-\\u0652\\u0670\\u0640]"), "")
            .replace(Regex("[أإآٱ]"), "ا")
            .replace("ى", "ي")
            .replace("ئ", "ي")
            .replace("ؤ", "و")
            .replace("ء", "")
            .replace("ة", "ه")

    fun searchText(body: String): String = normalizeForSearch(plainText(body))

    /** The relative stamp a row shows, in the page's words. */
    fun timeAgo(iso: String, now: Instant = Instant.now()): String {
        val then =
            runCatching { Instant.parse(iso) }.getOrNull()
                ?: return ""
        val minutes = java.time.Duration.between(then, now).toMinutes()
        return when {
            minutes < 1 -> "منذ لحظات"
            minutes < 60 -> "منذ $minutes دقيقة"
            minutes < 60 * 24 -> "منذ ${minutes / 60} ساعة"
            minutes < 60 * 24 * 7 -> "منذ ${minutes / (60 * 24)} يوم"
            else -> {
                val date = ZonedDateTime.ofInstant(then, ZoneId.systemDefault())
                date.format(DateTimeFormatter.ofPattern("d MMM yyyy"))
            }
        }
    }
}
