package com.royaraqamia.app.notes

import com.royaraqamia.app.plans.PlanDates
import com.royaraqamia.app.shared.TimeAgoParts
import com.royaraqamia.app.shared.timeAgoParts
import java.time.Instant

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

    /** The five phrases a relative stamp is made of, from either copy source (ADR-0104). */
    data class TimeAgoWords(
        val now: String,
        val minutes: String,
        val hours: String,
        val days: String,
        val weeks: String,
    )

    /** The list row's stamp, in [NotesListCopy]'s words. */
    fun listTimeAgo(iso: String, now: Instant = Instant.now()): String =
        timeAgo(
            iso,
            TimeAgoWords(
                NotesListCopy.AGO_NOW,
                NotesListCopy.AGO_MINUTES,
                NotesListCopy.AGO_HOURS,
                NotesListCopy.AGO_DAYS,
                NotesListCopy.AGO_WEEKS,
            ),
            now,
        )

    /** The editor's stamp, in [NotesCopy]'s words. The list and the editor are one surface. */
    fun editorTimeAgo(iso: String, now: Instant = Instant.now()): String =
        timeAgo(
            iso,
            TimeAgoWords(
                NotesCopy.AGO_NOW,
                NotesCopy.AGO_MINUTES,
                NotesCopy.AGO_HOURS,
                NotesCopy.AGO_DAYS,
                NotesCopy.AGO_WEEKS,
            ),
            now,
        )

    /**
     * What a past instant is, in one of this surface's copy sources. The
     * thresholds are the shared [timeAgoParts] (ADR-0104), so "three days ago"
     * crosses from hours to days on the same second the browser does; a month
     * out is the Hijri day the site prints, not a Gregorian abbreviation.
     */
    private fun timeAgo(iso: String, words: TimeAgoWords, now: Instant): String {
        val parts = timeAgoParts(iso, now)
        return when (parts.unit) {
            TimeAgoParts.Unit.NOW -> words.now
            TimeAgoParts.Unit.MINUTES -> withCount(words.minutes, parts.count)
            TimeAgoParts.Unit.HOURS -> withCount(words.hours, parts.count)
            TimeAgoParts.Unit.DAYS -> withCount(words.days, parts.count)
            TimeAgoParts.Unit.WEEKS -> withCount(words.weeks, parts.count)
            TimeAgoParts.Unit.DATE -> PlanDates.label(iso)
        }
    }

    /** An ASCII count, whatever the device's locale is (ADR-0104). */
    private fun withCount(sentence: String, count: Long): String =
        sentence.replace("{count}", count.toString())
}
