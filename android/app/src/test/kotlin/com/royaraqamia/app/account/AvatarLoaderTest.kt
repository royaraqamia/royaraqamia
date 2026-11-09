package com.royaraqamia.app.account

import com.royaraqamia.app.net.HttpResponse
import com.royaraqamia.app.support.RecordingTransport
import java.io.IOException
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/**
 * The avatar read (#945): an absolute URL, on the app's one transport, with a
 * failed read answering `null` so the card can draw the initial letter.
 */
class AvatarLoaderTest {
    private val url = "https://cdn.test/storage/v1/object/public/avatars/u/a.png"

    @Test
    fun `the loader reads the URL and keeps the bytes`() {
        val bytes = byteArrayOf(0, 1, 2, -1)
        val transport = RecordingTransport { HttpResponse(200, bytes) }

        val result = runBlocking { TransportAvatarLoader(transport).load(url) }

        assertArrayEquals(bytes, result)
        val request = transport.requests.single()
        assertEquals("GET", request.method)
        assertEquals(url, request.url)
        assertEquals("image/*", request.headers["Accept"])
        assertNull("an avatar is public, so it carries no bearer", request.bearer)
    }

    @Test
    fun `a 404 is nothing to draw`() {
        val transport = RecordingTransport { HttpResponse(404, "not found") }

        assertNull(runBlocking { TransportAvatarLoader(transport).load(url) })
    }

    @Test
    fun `an unreachable server is nothing to draw`() {
        val transport = RecordingTransport { throw IOException("offline") }

        assertNull(runBlocking { TransportAvatarLoader(transport).load(url) })
    }
}
