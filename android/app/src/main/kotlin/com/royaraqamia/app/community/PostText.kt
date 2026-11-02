package com.royaraqamia.app.community

/**
 * A post body as the card shows it (#658), ported from `shared/reading-time.ts`.
 *
 * The site's feed card has no title to print: the label it shows, and the text a
 * card clamps to four lines, are both derived from the markdown body by
 * `stripMarkdown` and `postExcerpt`. The app draws the same card, so it applies
 * the same rules rather than a "good enough" summary of them — a body the site
 * shows in full and the app cuts in half is the drift ADR-0098 names, and it is
 * invisible in review.
 *
 * The rules are a pipeline of replacements, applied to a fixed point exactly as
 * the site applies them (a replacement can expose another, which is why the
 * loop exists there). `shared/fixtures/parity/post-text.json` is what the
 * TypeScript computes; [com.royaraqamia.app.community.PostTextFixtureTest] is
 * what proves this port computes it too.
 *
 * JavaScript's `\s` is wider than Java's — it includes the no-break space an
 * Arabic editor inserts with a keypress — so the whitespace classes below spell
 * the JavaScript set out rather than trusting the platform's and silently
 * keeping a `\u00A0` the site collapses.
 */
object PostText {
    /** JS `\s`, which is `\s` plus the Unicode spaces Java's does not match. */
    private const val SPACE = "\\s\\u00A0\\u1680\\u2000-\\u200A\\u2028\\u2029\\u202F\\u205F\\u3000\\uFEFF"

    /** JS `[^\S\n]`: whitespace that is not a line break. */
    private const val SPACE_NOT_NEWLINE =
        "\\t\\x0B\\f\\r \\u00A0\\u1680\\u2000-\\u200A\\u2028\\u2029\\u202F\\u205F\\u3000\\uFEFF"

    private val anySpace = Regex("[$SPACE]+")

    private val passes: List<Pair<Regex, String>> =
        listOf(
            Regex("[<>]") to " ",
            Regex("```[\\s\\S]*?```") to " ",
            Regex("!\\[.*?\\]\\(.*?\\)") to " ",
            Regex("\\[([^\\]]*)\\]\\(.*?\\)") to " ",
            Regex("^#{1,6}[$SPACE]+", RegexOption.MULTILINE) to "",
            Regex("[*_]{2}([^*_]+)[*_]{2}") to "$1",
            Regex("[*_]([^*_]+)[*_]") to "$1",
            Regex("~~([^~]+)~~") to "$1",
            Regex("`[^`]*`") to " ",
            Regex("^>[$SPACE]+", RegexOption.MULTILINE) to " ",
            Regex("^[-*+][$SPACE]+", RegexOption.MULTILINE) to " ",
            Regex("^\\d+\\.[$SPACE]+", RegexOption.MULTILINE) to " ",
            Regex("^[-*_]{3,}[$SPACE]*$", RegexOption.MULTILINE) to " ",
            Regex("[|]") to " ",
            Regex("[$SPACE_NOT_NEWLINE]+") to " ",
            Regex(" *\\n *") to "\n",
            Regex("\\n{3,}") to "\n\n",
        )

    /** A markdown body as the plain text a card prints. */
    fun stripMarkdown(text: String): String {
        var previous: String
        var current = text
        do {
            previous = current
            current = passes.fold(current) { value, (pattern, replacement) ->
                pattern.replace(value, replacement)
            }
        } while (current != previous)

        return current.trimSpace()
    }

    /**
     * The card's label: markdown stripped, whitespace collapsed, ellipsised at
     * [max]. [fallback] is the post's meta description, used when the body has no
     * text of its own.
     */
    fun excerpt(content: String?, fallback: String = "", max: Int = 160): String {
        val text = content?.let { stripMarkdown(it) }.orEmpty()
        val source = anySpace.replace(if (text.isNotEmpty()) text else fallback, " ").trimSpace()
        if (source.length <= max) return source
        return source.substring(0, max - 1).trimSpace() + "…"
    }

    /** The site's `String.prototype.trim` set, which is wider than `Char.isWhitespace`. */
    private fun String.trimSpace(): String =
        trim { it.isWhitespace() || it == '\u00A0' || it == '\uFEFF' }

    /** The label a card's share text and its accessible name carry. */
    fun label(content: String?, metaDescription: String?): String =
        excerpt(content, metaDescription.orEmpty())
}
