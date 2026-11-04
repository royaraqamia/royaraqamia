package com.royaraqamia.app.quran

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment

/**
 * The vendored text, as the app reads it (#955).
 *
 * These are the site's own files, packaged by the build: the count is the whole
 * mushaf, the first sura is Al-Fatiha's seven Ayat, and the printed boundaries
 * are the same 604 pages the page's jump control reads.
 */
@RunWith(RobolectricTestRunner::class)
class QuranRepositoryTest {
    private val repository: QuranRepository by lazy {
        AssetQuranRepository(
            RuntimeEnvironment.getApplication(),
            PreferencesQuranPositionStore(RuntimeEnvironment.getApplication()),
        )
    }

    @Test
    fun `the index is the whole mushaf`() {
        val index = repository.index()
        assertEquals(114, index.surahs.size)
        assertEquals(6236, index.surahs.sumOf { it.ayahCount })
        assertEquals("الفاتحة", index.surahs.first().name)
        assertEquals("الناس", index.surahs.last().name)
    }

    @Test
    fun `a sura is the vendored text, not a retyped copy`() {
        val fatiha = requireNotNull(repository.surah(1))
        assertEquals(7, fatiha.ayahs.size)
        assertTrue(fatiha.ayahs.first().startsWith("بِسْمِ"))
        assertEquals(null, fatiha.bismillah)

        val kawthar = requireNotNull(repository.surah(108))
        assertEquals("الكوثر", kawthar.name)
        assertEquals(3, kawthar.ayahs.size)
        assertNotNull(kawthar.bismillah)
    }

    @Test
    fun `the printed boundaries are the page's`() {
        val pages = repository.pages()
        assertEquals(604, pages.pages.size)
        assertEquals(30, pages.juzs.size)
        assertEquals(60, pages.hizbs.size)
        assertEquals(15, pages.sajdas.size)

        assertEquals(1, pages.marksForSurah(1)[1]?.page)
        assertEquals("recommended", pages.marksForSurah(7)[206]?.sajda)
    }

    @Test
    fun `the search corpus is the whole text`() {
        assertEquals(6236, repository.searchCorpus()?.ayahs?.size)
    }
}
