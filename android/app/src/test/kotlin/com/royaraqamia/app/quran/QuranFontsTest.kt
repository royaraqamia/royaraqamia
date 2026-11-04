package com.royaraqamia.app.quran

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/** The Uthmani face with the three marks crossing to Amiri Quran (ADR 0067). */
class QuranFontsTest {
    @Test
    fun `the text is unchanged and only the marks take the second face`() {
        val text = "كَفَرُوا۟"
        val annotated = QuranFonts.annotated(text)
        assertEquals(text, annotated.text)

        val markIndex = text.indexOf('\u06DF')
        assertTrue(markIndex >= 0)
        val span = annotated.spanStyles.firstOrNull { markIndex in it.start until it.end }
        assertEquals(QuranFonts.marks, span?.item?.fontFamily)
    }
}
