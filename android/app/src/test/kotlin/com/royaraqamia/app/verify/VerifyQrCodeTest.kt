package com.royaraqamia.app.verify

import com.google.zxing.BinaryBitmap
import com.google.zxing.DecodeHintType
import com.google.zxing.MultiFormatReader
import com.google.zxing.RGBLuminanceSource
import com.google.zxing.common.HybridBinarizer
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Test

/**
 * The seal a shared certificate carries (#658).
 *
 * A QR that scans to the wrong URL is a printed certificate pointing somewhere
 * else, and no screen test would notice: the picture is there, it is only the
 * content that is wrong. So the test encodes with the encoder the app ships and
 * decodes it again with the same library's reader — the round trip is the claim.
 */
class VerifyQrCodeTest {
    private fun decode(matrix: com.google.zxing.common.BitMatrix): String? {
        val width = matrix.width
        val pixels = IntArray(width * width) { index ->
            if (matrix.get(index % width, index / width)) 0xFF000000.toInt() else 0xFFFFFFFF.toInt()
        }
        val source = RGBLuminanceSource(width, width, pixels)
        val bitmap = BinaryBitmap(HybridBinarizer(source))
        return MultiFormatReader()
            .decode(bitmap, mapOf(DecodeHintType.TRY_HARDER to true))
            .text
    }

    @Test
    fun `the seal encodes the certificate's own link`() {
        val url = VerifyQrCode.urlFor("https://royaraqamia.com", "comp-2026-uhvw9sg5")

        assertEquals("https://royaraqamia.com/verify/COMP-2026-UHVW9SG5", url)
    }

    @Test
    fun `a trailing slash on the site does not become a double slash`() {
        assertEquals(
            "https://royaraqamia.com/verify/COMP-2026-UHVW9SG5",
            VerifyQrCode.urlFor("https://royaraqamia.com/", "COMP-2026-UHVW9SG5"),
        )
    }

    @Test
    fun `the matrix decodes back to the link it was given`() {
        val url = VerifyQrCode.urlFor("https://royaraqamia.com", "COMP-2026-UHVW9SG5")
        val matrix = VerifyQrCode.matrix(url)

        assertNotNull(matrix)
        assertEquals(url, decode(matrix!!))
    }

    @Test
    fun `the matrix is square and has the quiet zone the site asks for`() {
        val matrix = VerifyQrCode.matrix("https://royaraqamia.com/verify/COMP-2026-UHVW9SG5", 512)

        assertNotNull(matrix)
        assertEquals(matrix!!.width, matrix.height)
        // The four corners of a quiet zone are blank: a scanner needs them.
        assertEquals(false, matrix.get(0, 0))
        assertEquals(false, matrix.get(matrix.width - 1, matrix.height - 1))
    }
}
