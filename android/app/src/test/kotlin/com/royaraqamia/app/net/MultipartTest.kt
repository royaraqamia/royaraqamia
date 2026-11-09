package com.royaraqamia.app.net

import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * The multipart body the avatar upload sends (#945).
 *
 * The route reads it through `req.formData().get('file')`, so the two things
 * that matter are the field name and that the file's bytes survive untouched.
 * The boundary is pinned here so the assertions can name it.
 */
class MultipartTest {
    private val boundary = "boundary-1"

    private fun bodyOf(file: MultipartFile): String =
        MultipartBody.of(file, boundary).bytes.toString(Charsets.UTF_8)

    @Test
    fun `the content type declares the boundary it wrote`() {
        val body =
            MultipartBody.of(
                MultipartFile("file", "avatar.png", "image/png", byteArrayOf(1, 2, 3)),
                boundary,
            )

        assertEquals("multipart/form-data; boundary=$boundary", body.contentType)
    }

    @Test
    fun `the part is the field and file name the route reads`() {
        val body = bodyOf(MultipartFile("file", "avatar.png", "image/png", byteArrayOf()))

        assertTrue(
            body,
            body.contains(
                "Content-Disposition: form-data; name=\"file\"; filename=\"avatar.png\""
            )
        )
        assertTrue(body, body.contains("Content-Type: image/png"))
        assertTrue(body, body.startsWith("--$boundary\r\n"))
        assertTrue(body, body.endsWith("--$boundary--\r\n"))
    }

    @Test
    fun `the file bytes survive the body`() {
        val bytes = byteArrayOf(0, 1, 2, 127, -128, -1)
        val body =
            MultipartBody.of(
                MultipartFile("file", "avatar.bin", "application/octet-stream", bytes),
                boundary,
            )

        val marker = "Content-Type: application/octet-stream\r\n\r\n".toByteArray(Charsets.UTF_8)
        val start = body.bytes.indexOfSubarray(marker) + marker.size
        val written = body.bytes.copyOfRange(start, start + bytes.size)

        assertArrayEquals(bytes, written)
    }

    @Test
    fun `a quote or newline in a name cannot split the header`() {
        val body = bodyOf(MultipartFile("fi\"le", "ava\ntar.png", "image/png", byteArrayOf()))

        assertFalse("the name closed its own header", body.contains("fi\"le"))
        assertFalse("the file name split the header", body.contains("ava\ntar.png"))
        assertTrue(body, body.contains("name=\"fi'le\"; filename=\"ava tar.png\""))
    }

    private fun ByteArray.indexOfSubarray(needle: ByteArray): Int {
        if (needle.isEmpty()) return 0
        for (index in 0..(size - needle.size)) {
            if (needle.indices.all { this[index + it] == needle[it] }) return index
        }
        return -1
    }
}
