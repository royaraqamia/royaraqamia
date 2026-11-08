package com.royaraqamia.app.scan

import com.google.zxing.BarcodeFormat
import com.google.zxing.EncodeHintType
import com.google.zxing.common.BitMatrix
import com.google.zxing.oned.Code128Writer
import com.royaraqamia.app.verify.VerifyQrCode
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Test

/**
 * The Scanner's decoder (#932), proved by round trip rather than by a picture:
 * the app encodes a symbol and the decoder has to read it back.
 *
 * The two paths the camera and the upload picker use are both exercised —
 * luminance bytes from a frame, and ARGB pixels from a picture — and the one
 * test that has to turn the symbol does so with a 1D barcode, which is the
 * symbology that cannot be read sideways without the extra quarter turns.
 */
class ScanDecoderTest {
    private val payload = "https://royaraqamia.com/verify/COMP-2026-UHVW9SG5"

    private fun pixelsOf(matrix: BitMatrix): Pair<IntArray, Int> {
        val width = matrix.width
        val height = matrix.height
        val pixels =
            IntArray(width * height) { index ->
                if (matrix.get(index % width, index / width)) 0xFF000000.toInt()
                else 0xFFFFFFFF.toInt()
            }
        return pixels to width
    }

    private fun rotateClockwise(pixels: IntArray, width: Int, height: Int): IntArray {
        val rotated = IntArray(pixels.size)
        for (y in 0 until height) {
            for (x in 0 until width) {
                val newX = height - 1 - y
                val newY = x
                rotated[newY * height + newX] = pixels[y * width + x]
            }
        }
        return rotated
    }

    @Test
    fun `decodes a QR the app itself encodes`() {
        val matrix = VerifyQrCode.matrix(payload)
        assertNotNull(matrix)
        val (pixels, width) = pixelsOf(matrix!!)

        val hit = ScanDecoder.decodePixels(pixels, width, width)

        assertNotNull(hit)
        assertEquals(payload, hit!!.rawValue)
        assertEquals("QR_CODE", hit.format)
    }

    @Test
    fun `reads the same symbol from a luminance frame`() {
        val matrix = VerifyQrCode.matrix(payload)!!
        val width = matrix.width
        val luma =
            ByteArray(width * width) { index ->
                if (matrix.get(index % width, index / width)) 0 else 255.toByte()
            }

        val hit = ScanDecoder.decodeLuminance(luma, width, width)

        assertNotNull(hit)
        assertEquals(payload, hit!!.rawValue)
    }

    @Test
    fun `turns a sideways one-dimensional barcode back upright`() {
        val matrix =
            Code128Writer().encode(
                "ROYARAQAMIA-932",
                BarcodeFormat.CODE_128,
                480,
                160,
                mapOf(EncodeHintType.MARGIN to 12),
            )
        val (upright, width) = pixelsOf(matrix)
        val height = matrix.height

        // The symbol is stored on its side, the way a phone held against a
        // label often presents it.
        val sideways = rotateClockwise(upright, width, height)

        val hit = ScanDecoder.decodePixels(sideways, height, width)

        assertNotNull(hit)
        assertEquals("ROYARAQAMIA-932", hit!!.rawValue)
        assertEquals("CODE_128", hit.format)
    }

    @Test
    fun `finds nothing in a blank frame`() {
        assertNull(ScanDecoder.decodePixels(IntArray(64 * 64) { 0xFFFFFFFF.toInt() }, 64, 64))
    }
}
