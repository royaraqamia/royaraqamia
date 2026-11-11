package com.royaraqamia.app.chats

import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * The clip's bytes (ADR-0126, #933): the same 44-byte WAV header the site
 * writes, so one transcription path accepts both clients' recordings.
 */
class ChatVoiceRecorderTest {
    @Test
    fun `the WAV header is the site's`() {
        val wav = wav(byteArrayOf(1, 2, 3, 4))

        assertEquals("RIFF", String(wav, 0, 4))
        assertEquals("WAVE", String(wav, 8, 4))
        assertEquals("fmt ", String(wav, 12, 4))
        assertEquals("data", String(wav, 36, 4))
        assertEquals(48, wav.size)
        assertEquals(36 + 4, littleEndianInt(wav, 4))
        assertEquals(4, littleEndianInt(wav, 40))
        assertEquals(1, littleEndianShort(wav, 20))
        assertEquals(1, littleEndianShort(wav, 22))
        assertEquals(24_000, littleEndianInt(wav, 24))
        assertEquals(48_000, littleEndianInt(wav, 28))
        assertEquals(2, littleEndianShort(wav, 32))
        assertEquals(16, littleEndianShort(wav, 34))
        assertArrayEquals(byteArrayOf(1, 2, 3, 4), wav.copyOfRange(44, 48))
    }

    @Test
    fun `samples are written little-endian`() {
        val pcm = pcmBytes(shortArrayOf(0x0102, -2), 2)

        assertArrayEquals(byteArrayOf(0x02, 0x01, 0xFE.toByte(), 0xFF.toByte()), pcm)
    }

    private fun littleEndianInt(bytes: ByteArray, at: Int): Int =
        (bytes[at].toInt() and 0xFF) or
            ((bytes[at + 1].toInt() and 0xFF) shl 8) or
            ((bytes[at + 2].toInt() and 0xFF) shl 16) or
            ((bytes[at + 3].toInt() and 0xFF) shl 24)

    private fun littleEndianShort(bytes: ByteArray, at: Int): Int =
        (bytes[at].toInt() and 0xFF) or ((bytes[at + 1].toInt() and 0xFF) shl 8)
}
