package com.royaraqamia.app.quran

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** The site's Quran routes, as the shell reads them (#955). */
class QuranRoutesTest {
    @Test
    fun `the index and a sura are the two shapes`() {
        assertTrue(QuranRoutes.matches("/quran"))
        assertTrue(QuranRoutes.matches("/quran/108"))
        assertFalse(QuranRoutes.matches("/quran/115"))
        assertFalse(QuranRoutes.matches("/qurans"))
    }

    @Test
    fun `the sura number is the route param`() {
        assertEquals(108, QuranRoutes.surahOf("/quran/108"))
        assertEquals(108, QuranRoutes.surahOf("/quran/108/"))
        assertNull(QuranRoutes.surahOf("/quran/0"))
        assertNull(QuranRoutes.surahOf("/quran/one"))
    }

    @Test
    fun `the fragment names the Ayah to land on`() {
        assertEquals(3, QuranRoutes.ayahOf("/quran/108#ayah-3"))
        assertNull(QuranRoutes.ayahOf("/quran/108"))
        assertEquals("/quran/108#ayah-3", QuranRoutes.routeOf(108, 3))
    }
}
