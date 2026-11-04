package com.royaraqamia.app.quran

/**
 * The Quran search's folding rules, in the app (#955, P4).
 *
 * The web's `shared/contracts/quran-search.ts` is the reference: the same marks
 * come off, the same letters fold and the same loose pass runs only after the
 * exact one finds nothing. The text itself is never rewritten — this folds a
 * query and a comparison copy, so a hit is still drawn in the Ayah's own writing.
 */
object QuranSearch {
    /** The shortest query that searches the text, as the page decides it. */
    const val MIN_QUERY = 2

    /** How many Ayah hits the screen shows before «عرض المزيد». */
    const val PAGE_SIZE = 20

    private const val SUPERSCRIPT_ALEF = '\u0670'
    private const val TATWEEL = '\u0640'
    private const val BOM = '\uFEFF'

    private val folds =
        mapOf(
            '\u0622' to '\u0627', // آ
            '\u0623' to '\u0627', // أ
            '\u0625' to '\u0627', // إ
            '\u0671' to '\u0627', // ٱ
            SUPERSCRIPT_ALEF to '\u0627', // ٰ
            '\u0649' to '\u064A', // ى
            '\u0626' to '\u064A', // ئ
            '\u0624' to '\u0648', // ؤ
            '\u0629' to '\u0647', // ة
        )

    private val longVowels = setOf('\u0627', '\u0648', '\u064A')

    /** One string folded for comparison; never shown. */
    fun normalize(value: String): String {
        val out = StringBuilder()
        for (character in value) {
            if (character != SUPERSCRIPT_ALEF && isMark(character)) continue
            val folded = folds[character] ?: character
            if (folded.isWhitespace()) {
                if (out.isNotEmpty() && out.last() != ' ') out.append(' ')
            } else {
                out.append(folded)
            }
        }
        return out.toString().trim()
    }

    /** The looser form: the long vowels are dropped, so spelling variants meet. */
    fun normalizeLoose(value: String): String =
        normalize(value).filterNot { it in longVowels }

    /** Where a match sits inside the original Ayah, expanded to whole words. */
    data class Match(val before: String, val match: String, val after: String)

    /**
     * Marks [needle] (already folded) inside [original], or null when absent.
     *
     * The range is widened to the words it touches: slicing at the matched
     * letters would cut a letter from the marks that follow it, and a fatha
     * stranded at the start of the next span renders on the wrong letter.
     */
    fun mark(original: String, needle: String, loose: Boolean = false): Match? {
        if (needle.isEmpty()) return null
        val (text, map) = normalizeWithMap(original, loose)
        val start = text.indexOf(needle)
        if (start < 0) return null
        val end = start + needle.length - 1
        var from = map.getOrElse(start) { 0 }
        var to = map.getOrElse(end) { original.length - 1 } + 1

        while (from > 0 && !original[from - 1].isWhitespace()) from -= 1
        while (to < original.length && !original[to].isWhitespace()) to += 1

        return Match(
            before = original.substring(0, from),
            match = original.substring(from, to),
            after = original.substring(to),
        )
    }

    /** The positions whose folded text contains [query], and how many there are. */
    data class Answer(val positions: List<Int>, val total: Int, val loose: Boolean)

    fun find(
        exactCorpus: List<String>,
        looseCorpus: List<String>,
        query: String,
        limit: Int = PAGE_SIZE,
    ): Answer {
        val exact = normalize(query)
        if (exact.length < MIN_QUERY) return Answer(emptyList(), 0, false)

        val exactHits = scan(exactCorpus, exact, limit)
        if (exactHits.total > 0) return Answer(exactHits.positions, exactHits.total, false)

        val folded = normalizeLoose(query)
        if (folded.length < MIN_QUERY) return Answer(emptyList(), 0, false)
        val looseHits = scan(looseCorpus, folded, limit)
        return Answer(looseHits.positions, looseHits.total, true)
    }

    /**
     * Which sura and Ayah the [position]-th Ayah of the whole text is.
     *
     * The corpus is one array in reading order, so this is the only place the two
     * coordinate systems meet.
     */
    fun surahAyahOf(position: Int, counts: List<Int>): Pair<Int, Int>? {
        if (position < 0) return null
        var remaining = position
        for ((index, count) in counts.withIndex()) {
            if (remaining < count) return (index + 1) to (remaining + 1)
            remaining -= count
        }
        return null
    }

    /** The folded comparison copy of a whole corpus, in reading order. */
    fun exactCorpus(ayahs: List<String>): List<String> = ayahs.map(::normalize)

    fun looseCorpus(ayahs: List<String>): List<String> = ayahs.map(::normalizeLoose)

    private data class Hits(val positions: List<Int>, val total: Int)

    private fun scan(corpus: List<String>, needle: String, limit: Int): Hits {
        val positions = mutableListOf<Int>()
        var total = 0
        for ((position, ayah) in corpus.withIndex()) {
            if (!ayah.contains(needle)) continue
            total += 1
            if (positions.size < limit) positions += position
        }
        return Hits(positions, total)
    }

    private fun normalizeWithMap(value: String, loose: Boolean): Pair<String, IntArray> {
        val text = StringBuilder()
        val map = mutableListOf<Int>()
        for ((index, character) in value.withIndex()) {
            if (character != SUPERSCRIPT_ALEF && isMark(character)) continue
            if (character.isWhitespace()) {
                if (text.isNotEmpty() && text.last() != ' ') {
                    text.append(' ')
                    map += index
                }
                continue
            }
            val folded = folds[character] ?: character
            if (loose && folded in longVowels) continue
            text.append(folded)
            map += index
        }
        return text.toString() to map.toIntArray()
    }

    private fun isMark(character: Char): Boolean =
        character == TATWEEL ||
            character == BOM ||
            when (Character.getType(character).toByte()) {
                Character.NON_SPACING_MARK,
                Character.ENCLOSING_MARK,
                Character.COMBINING_SPACING_MARK,
                -> true
                else -> false
            }
}
