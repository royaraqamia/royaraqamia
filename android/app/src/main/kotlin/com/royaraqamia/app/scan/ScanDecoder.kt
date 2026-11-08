package com.royaraqamia.app.scan

import com.google.zxing.BinaryBitmap
import com.google.zxing.DecodeHintType
import com.google.zxing.LuminanceSource
import com.google.zxing.MultiFormatReader
import com.google.zxing.common.HybridBinarizer

/** One symbol a frame held: its payload, and the symbology that carried it. */
data class ScanHit(val rawValue: String, val format: String)

/**
 * The Scanner's on-device decoder (#932).
 *
 * Frames never leave the phone: the camera's luminance plane and an uploaded
 * picture both become a [LuminanceSource] here, and ZXing's
 * [MultiFormatReader] reads them in process (ADR-0034). A decode is attempted at
 * the sensor's rotation and then at the remaining quarter turns, because a QR is
 * rotation-tolerant but a one-dimensional barcode is not.
 *
 * The reader is created per attempt rather than shared: a `MultiFormatReader`
 * keeps the last format it recognised, which is harmless when one caller drives
 * it, and a liability when the camera thread and an uploaded image can overlap.
 */
object ScanDecoder {
    private val HINTS: Map<DecodeHintType, Any> =
        mapOf(
            DecodeHintType.TRY_HARDER to true,
            DecodeHintType.ALSO_INVERTED to true,
            DecodeHintType.CHARACTER_SET to "UTF-8",
        )

    private val QUARTER_TURNS = listOf(0, 90, 180, 270)

    /**
     * Reads a camera frame's luminance plane. [luma] is the Y plane of a
     * `YUV_420_888`/NV21 frame, one byte per pixel in row-major order.
     */
    fun decodeLuminance(
        luma: ByteArray,
        width: Int,
        height: Int,
        rotationDegrees: Int = 0,
    ): ScanHit? {
        if (width <= 0 || height <= 0 || luma.size < width * height) return null
        return decode(ByteMatrixSource(luma.copyOf(width * height), width, height), rotationDegrees)
    }

    /** Reads an uploaded picture, whose pixels are already ARGB. */
    fun decodePixels(
        pixels: IntArray,
        width: Int,
        height: Int,
        rotationDegrees: Int = 0,
    ): ScanHit? {
        if (width <= 0 || height <= 0 || pixels.size < width * height) return null
        val luma = ByteArray(width * height)
        for (index in 0 until width * height) {
            val color = pixels[index]
            val red = (color shr 16) and 0xFF
            val green = (color shr 8) and 0xFF
            val blue = color and 0xFF
            // Rec. 601 luminance, in integer arithmetic: a decode does not need
            // the sub-point of precision a float would add.
            luma[index] = ((red * 306 + green * 601 + blue * 117) shr 10).toByte()
        }
        return decode(ByteMatrixSource(luma, width, height), rotationDegrees)
    }

    private fun decode(source: ByteMatrixSource, rotationDegrees: Int): ScanHit? {
        val rotations = linkedSetOf(rotationDegrees, *QUARTER_TURNS.toTypedArray())
        for (degrees in rotations) {
            decodeOnce(source.rotated(degrees))?.let { return it }
        }
        return null
    }

    private fun decodeOnce(source: LuminanceSource): ScanHit? =
        runCatching {
            val result =
                MultiFormatReader()
                    .apply { setHints(HINTS) }
                    .decode(BinaryBitmap(HybridBinarizer(source)))
            val value = result.text
            if (value.isNullOrEmpty()) null else ScanHit(value, result.barcodeFormat.name)
        }.getOrNull()

    /**
     * A luminance plane as a [LuminanceSource] we can turn ourselves: ZXing's
     * `PlanarYUVLuminanceSource` does not support rotation, and rotating a
     * camera frame is the whole reason this small class exists.
     */
    private class ByteMatrixSource(
        private val matrix: ByteArray,
        width: Int,
        height: Int,
    ) : LuminanceSource(width, height) {
        override fun getRow(y: Int, row: ByteArray?): ByteArray {
            val target = if (row != null && row.size >= width) row else ByteArray(width)
            System.arraycopy(matrix, y * width, target, 0, width)
            return target
        }

        override fun getMatrix(): ByteArray = matrix

        override fun isRotateSupported(): Boolean = false

        fun rotated(degrees: Int): ByteMatrixSource {
            var current = this
            val turns = (((degrees % 360) + 360) % 360) / 90
            repeat(turns) { current = current.rotateMatrix() }
            return current
        }

        private fun rotateMatrix(): ByteMatrixSource {
            val oldWidth = width
            val oldHeight = height
            val rotated = ByteArray(matrix.size)
            for (y in 0 until oldHeight) {
                for (x in 0 until oldWidth) {
                    val newX = y
                    val newY = oldWidth - 1 - x
                    rotated[newY * oldHeight + newX] = matrix[y * oldWidth + x]
                }
            }
            return ByteMatrixSource(rotated, oldHeight, oldWidth)
        }
    }
}
