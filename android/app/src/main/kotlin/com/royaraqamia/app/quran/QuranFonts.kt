package com.royaraqamia.app.quran

import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.withStyle
import com.royaraqamia.app.R

/**
 * The reader's two faces, from the vendored files (#955, ADR-0064, ADR-0067).
 *
 * The text is the King Fahd Complex's Uthmani Hafs, the same face the page sets
 * the mushaf in. The three silent-letter marks the face draws as its ayah rosette
 * are set in Amiri Quran instead, which is what the page's `unicode-range` does;
 * Compose has no `unicode-range`, so [annotated] applies the marks face to those
 * three code points and leaves every letter in the Uthmani face.
 *
 * The fonts are the published files, copied unmodified: the KFGQPC EULA permits
 * use, copy and distribution but no modification, and the app ships its TTF and
 * its EULA together under `assets/fonts/`.
 */
object QuranFonts {
    val text = FontFamily(Font(R.font.kfgqpc_hafs_uthmani))
    val marks = FontFamily(Font(R.font.amiri_quran))

    /** U+06DF, U+06E3 and U+06EB: the marks ADR 0067 cuts out of the Uthmani face. */
    private val markCodePoints = setOf('\u06DF', '\u06E3', '\u06EB')

    /** [text] with its three silent-letter marks set in Amiri Quran. */
    fun annotated(text: String): AnnotatedString =
        buildAnnotatedString {
            for (character in text) {
                if (character in markCodePoints) {
                    withStyle(SpanStyle(fontFamily = marks)) { append(character) }
                } else {
                    append(character)
                }
            }
        }
}
