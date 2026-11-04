package com.royaraqamia.app.quran

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** The search's folding rules, against the web's `quran-search.ts` (#955). */
class QuranSearchTest {
    @Test
    fun `marks come off and the alef forms fold together`() {
        assertEquals("الرحمان", QuranSearch.normalize("ٱلرَّحْمَٰن"))
        assertEquals("الصلواه", QuranSearch.normalize("ٱلصَّلَوٰة"))
    }

    @Test
    fun `the loose pass drops the long vowels`() {
        assertEquals("لصله", QuranSearch.normalizeLoose("الصلاة"))
        assertEquals("لصله", QuranSearch.normalizeLoose("الصلوة"))
    }

    @Test
    fun `a hit is marked inside the Ayah's own writing`() {
        val match =
            QuranSearch.mark(
                "بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ",
                QuranSearch.normalizeLoose("الرحمن"),
                loose = true,
            )
        assertEquals("الرحمان", QuranSearch.normalize(match!!.match))
        assertTrue(match.before.isNotEmpty())
        assertTrue(match.after.isNotEmpty())
    }

    @Test
    fun `a position maps to its sura and Ayah`() {
        assertEquals(1 to 1, QuranSearch.surahAyahOf(0, listOf(7, 286)))
        assertEquals(2 to 1, QuranSearch.surahAyahOf(7, listOf(7, 286)))
        assertNull(QuranSearch.surahAyahOf(300, listOf(7, 286)))
    }

    @Test
    fun `the exact pass finds a query and counts every hit`() {
        val corpus = listOf("بسم الله الرحمن الرحيم", "الحمد لله رب العالمين")
        val exact = QuranSearch.exactCorpus(corpus)
        val loose = QuranSearch.looseCorpus(corpus)
        val answer = QuranSearch.find(exact, loose, "الرحمن")
        assertEquals(listOf(0), answer.positions)
        assertEquals(1, answer.total)
        assertEquals(false, answer.loose)
    }

    @Test
    fun `digits from an Arabic keyboard become ASCII`() {
        assertEquals("123", toLatinDigits("\u0661\u0662\u0663"))
        assertEquals("123", toLatinDigits("\u06F1\u06F2\u06F3"))
    }
}
