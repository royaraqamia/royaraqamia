package com.royaraqamia.app.quran

import android.content.Context
import kotlinx.serialization.json.Json

/**
 * The Quran reader's data seam (#955).
 *
 * The screen asks for the index, one sura and the printed boundaries, and never
 * learns that they are assets rather than a route: the text is vendored, so the
 * reader opens a sura with no network at all (ADR-0057). A test can hand the
 * screen the same three values without an Android asset manager.
 */
interface QuranRepository {
    fun index(): QuranIndex

    fun surah(number: Int): QuranSurah?

    fun pages(): QuranPages

    fun searchCorpus(): QuranSearchAsset?

    fun position(): QuranReadingPosition?

    fun savePosition(surah: Int, ayah: Int)
}

/**
 * The app's reader, reading the files the build copies from `public/quran`.
 *
 * The index and the boundaries are read once; a sura is read when it is opened
 * and kept, because a reader returns to the same few suras. The search corpus is
 * the one large asset (1.3 MiB), so it is read only when the field first asks for
 * it, the way the page fetches it on first focus.
 */
class AssetQuranRepository(
    private val context: Context,
    private val positions: QuranPositionStore,
) : QuranRepository {
    private val json = Json { ignoreUnknownKeys = true }

    private val indexValue: QuranIndex by lazy { read("quran/meta/index.json", QuranIndex.serializer()) }

    private val pagesValue: QuranPages by lazy { read("quran/meta/pages.json", QuranPages.serializer()) }

    private val suras = mutableMapOf<Int, QuranSurah?>()

    private var corpus: QuranSearchAsset? = null
    private var corpusRead = false

    override fun index(): QuranIndex = indexValue

    override fun surah(number: Int): QuranSurah? =
        suras.getOrPut(number) {
            if (number !in 1..QURAN_SURAH_COUNT) null
            else read("quran/surah/${number.toString().padStart(3, '0')}.json", QuranSurah.serializer())
        }

    override fun pages(): QuranPages = pagesValue

    override fun searchCorpus(): QuranSearchAsset? {
        if (!corpusRead) {
            corpusRead = true
            corpus = runCatching { read("quran/search/index.json", QuranSearchAsset.serializer()) }.getOrNull()
            // A failed read is not remembered: the field's retry has to be able to
            // mean something.
            if (corpus == null) corpusRead = false
        }
        return corpus
    }

    override fun position(): QuranReadingPosition? = positions.read()

    override fun savePosition(surah: Int, ayah: Int) {
        if (surah !in 1..QURAN_SURAH_COUNT || ayah < 1) return
        positions.write(QuranReadingPosition(surah, ayah, nowIso()))
    }

    private fun <T> read(path: String, serializer: kotlinx.serialization.KSerializer<T>): T =
        context.assets.open(path).bufferedReader().use { reader ->
            json.decodeFromString(serializer, reader.readText())
        }

    private fun nowIso(): String = java.time.Instant.now().toString()

    companion object {
        const val QURAN_SURAH_COUNT = 114
    }
}
