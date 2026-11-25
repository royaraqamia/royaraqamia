package com.royaraqamia.app.quran

import android.content.Context
import com.royaraqamia.app.store.outbox.DrainReport
import kotlinx.serialization.json.Json

/**
 * The Quran reader's data seam (#955), extended with the reader's owned
 * records (#1751).
 *
 * The screen asks for the index, one sura, the printed boundaries, the marks
 * and the tafsir, and never learns that the text and the study notes are assets
 * rather than routes: the reader opens a sura with no network at all (ADR-0057).
 * Marks and position are the account's through [QuranReaderStore] when one is
 * wired, and the device's when it is not (a guest, and the visual suite).
 */
interface QuranRepository {
    fun index(): QuranIndex

    fun surah(number: Int): QuranSurah?

    fun pages(): QuranPages

    fun searchCorpus(): QuranSearchAsset?

    suspend fun position(): QuranReadingPosition?

    suspend fun savePosition(surah: Int, ayah: Int)

    suspend fun bookmarks(): List<QuranBookmarkRow>

    suspend fun toggleBookmark(surah: Int, ayah: Int): BookmarkToggle

    /** The vendored study notes for one sura, read on first open. */
    suspend fun tafsir(number: Int): QuranSurahTafsir?

    suspend fun pull()

    suspend fun drain(): DrainReport

    suspend fun outboxStatus(): DrainReport

    suspend fun retryFailed()
}

/**
 * The app's reader, reading the files the build copies from `public/quran`.
 *
 * The index and the boundaries are read once; a sura and its tafsir are read
 * when opened and kept, because a reader returns to the same few suras. The
 * search corpus is the one large asset (1.3 MiB), so it is read only when the
 * field first asks for it, the way the page fetches it on first focus.
 */
class AssetQuranRepository(
    private val context: Context,
    private val positions: QuranPositionStore? = null,
    private val own: QuranReaderStore? = null,
) : QuranRepository {
    private val json = Json { ignoreUnknownKeys = true }

    private val indexValue: QuranIndex by lazy { read("quran/meta/index.json", QuranIndex.serializer()) }

    private val pagesValue: QuranPages by lazy { read("quran/meta/pages.json", QuranPages.serializer()) }

    private val suras = mutableMapOf<Int, QuranSurah?>()

    private val tafsirs = mutableMapOf<Int, QuranSurahTafsir?>()

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

    override suspend fun tafsir(number: Int): QuranSurahTafsir? {
        if (number !in 1..QURAN_SURAH_COUNT) return null
        return tafsirs.getOrPut(number) {
            runCatching {
                read(
                    "quran/tafsir/moyassar/${number.toString().padStart(3, '0')}.json",
                    QuranSurahTafsir.serializer(),
                )
            }.getOrNull()
        }
    }

    override suspend fun position(): QuranReadingPosition? =
        own?.position() ?: positions?.read()

    override suspend fun savePosition(surah: Int, ayah: Int) {
        if (surah !in 1..QURAN_SURAH_COUNT || ayah < 1) return
        val store = own
        if (store != null) {
            store.savePosition(surah, ayah)
        } else {
            positions?.write(QuranReadingPosition(surah, ayah, nowIso()))
        }
    }

    override suspend fun bookmarks(): List<QuranBookmarkRow> = own?.bookmarks().orEmpty()

    override suspend fun toggleBookmark(surah: Int, ayah: Int): BookmarkToggle =
        own?.toggleBookmark(surah, ayah) ?: BookmarkToggle(marked = false, refusal = null)

    override suspend fun pull() {
        own?.pull()
    }

    override suspend fun drain(): DrainReport =
        own?.drain() ?: DrainReport(replayed = 0, pending = 0, failed = 0)

    override suspend fun outboxStatus(): DrainReport =
        own?.outboxStatus() ?: DrainReport(replayed = 0, pending = 0, failed = 0)

    override suspend fun retryFailed() {
        own?.retryFailed()
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
