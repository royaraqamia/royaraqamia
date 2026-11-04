package com.royaraqamia.app.quran

import kotlinx.serialization.Serializable

/**
 * The Quran reader's vendored data, as `public/quran` stores it (#955).
 *
 * These are the site's own files, packaged from `public/quran` by the build
 * rather than retyped: `QuranData.kt` only names the fields, and the text stays
 * Tanzil's verbatim Uthmani copy (ADR-0057). A field the app does not read is
 * ignored by the decoder instead of being copied into a second model.
 */
@Serializable
data class QuranIndex(val surahs: List<QuranSurahSummary> = emptyList())

/** One sura as the index lists it. */
@Serializable
data class QuranSurahSummary(
    val n: Int,
    val name: String,
    val ayahCount: Int,
    /** Tanzil's word: `Meccan` or `Medinan`. */
    val revelation: String,
    val revelationOrder: Int = 0,
)

/** One sura's text. `bismillah` is null on Al-Fatiha and At-Tawba. */
@Serializable
data class QuranSurah(
    val n: Int,
    val name: String,
    val bismillah: String? = null,
    val ayahs: List<String> = emptyList(),
)

/** A page, juz or hizb and the Ayah it opens on. */
@Serializable data class QuranBoundary(val n: Int, val surah: Int, val ayah: Int)

/** A sajdah Ayah and whether the prostration is owed or offered. */
@Serializable data class QuranSajda(val surah: Int, val ayah: Int, val type: String)

/** The printed Mushaf's boundaries, as `meta/pages.json` stores them. */
@Serializable
data class QuranPages(
    val pages: List<QuranBoundary> = emptyList(),
    val juzs: List<QuranBoundary> = emptyList(),
    val hizbs: List<QuranBoundary> = emptyList(),
    val sajdas: List<QuranSajda> = emptyList(),
)

/** The marks one Ayah carries, if it carries any. */
data class QuranAyahMarks(
    val page: Int? = null,
    val juz: Int? = null,
    val hizb: Int? = null,
    val sajda: String? = null,
)

/** The searchable copy of the text, as `public/quran/search/index.json` stores it. */
@Serializable data class QuranSearchAsset(val ayahs: List<String> = emptyList())

/** Where a reader stopped, as the device remembers it (ADR-0056). */
data class QuranReadingPosition(val surah: Int, val ayah: Int, val updatedAt: String)

/**
 * What each of one sura's Ayat carries, keyed by Ayah number.
 *
 * A mark belongs to the Ayah that opens the range, so an Ayah with no mark is
 * simply inside one. The reader draws the marks it is handed and invents none.
 */
fun QuranPages.marksForSurah(surah: Int): Map<Int, QuranAyahMarks> {
    val marks = mutableMapOf<Int, QuranAyahMarks>()
    fun add(ayah: Int, mark: QuranAyahMarks) {
        marks[ayah] = (marks[ayah] ?: QuranAyahMarks()).merge(mark)
    }

    pages.filter { it.surah == surah }.forEach { add(it.ayah, QuranAyahMarks(page = it.n)) }
    juzs.filter { it.surah == surah }.forEach { add(it.ayah, QuranAyahMarks(juz = it.n)) }
    hizbs.filter { it.surah == surah }.forEach { add(it.ayah, QuranAyahMarks(hizb = it.n)) }
    sajdas.filter { it.surah == surah }.forEach { add(it.ayah, QuranAyahMarks(sajda = it.type)) }
    return marks
}

private fun QuranAyahMarks.merge(other: QuranAyahMarks): QuranAyahMarks =
    QuranAyahMarks(
        page = other.page ?: page,
        juz = other.juz ?: juz,
        hizb = other.hizb ?: hizb,
        sajda = other.sajda ?: sajda,
    )
