package com.royaraqamia.app.quran

import com.royaraqamia.app.QuranPlayerSnapshot
import com.royaraqamia.app.QuranPlayerStatus
import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * The recitation panel's faces (#956).
 *
 * The panel is a view over the service, so the one rule worth pinning is which
 * face a snapshot paints on a given reader: a sura the controller is not on is
 * always "listen to this one", and a shared saved copy only decorates a sura the
 * service is actually holding.
 */
class QuranPlayerStateTest {
    @Test
    fun `a sura the controller is not on is always idle`() {
        val snapshot =
            QuranPlayerSnapshot(
                status = QuranPlayerStatus.PLAYING,
                surah = 2,
                ayah = 3,
                ayahCount = 286,
            )

        assertEquals(QuranPlayerFace.Idle, QuranPlayerFace.of(1, snapshot))
    }

    @Test
    fun `playing on this sura carries the Ayah, the count and the saved copy`() {
        val snapshot =
            QuranPlayerSnapshot(
                status = QuranPlayerStatus.PLAYING,
                surah = 1,
                name = "الفاتحة",
                ayah = 2,
                ayahCount = 7,
                saved = "complete",
            )

        assertEquals(
            QuranPlayerFace.Playing("الفاتحة", 2, 7, savedComplete = true),
            QuranPlayerFace.of(1, snapshot),
        )
    }

    @Test
    fun `a paused sura resumes where the service is`() {
        val snapshot =
            QuranPlayerSnapshot(
                status = QuranPlayerStatus.PAUSED,
                surah = 1,
                name = "الفاتحة",
                ayah = 5,
                ayahCount = 7,
            )

        assertEquals(
            QuranPlayerFace.Paused("الفاتحة", 5, 7, savedComplete = false),
            QuranPlayerFace.of(1, snapshot),
        )
    }

    @Test
    fun `a load in flight waits`() {
        val snapshot = QuranPlayerSnapshot(status = QuranPlayerStatus.LOADING, surah = 1)

        assertEquals(QuranPlayerFace.Loading, QuranPlayerFace.of(1, snapshot))
    }

    @Test
    fun `a network refusal is offline and anything else is failed`() {
        assertEquals(
            QuranPlayerFace.Offline,
            QuranPlayerFace.of(1, QuranPlayerSnapshot(status = QuranPlayerStatus.OFFLINE, surah = 1)),
        )
        assertEquals(
            QuranPlayerFace.Failed,
            QuranPlayerFace.of(1, QuranPlayerSnapshot(status = QuranPlayerStatus.FAILED, surah = 1)),
        )
    }

    @Test
    fun `a connection that never produced a sura still says why`() {
        assertEquals(
            QuranPlayerFace.Failed,
            QuranPlayerFace.of(1, QuranPlayerSnapshot(status = QuranPlayerStatus.FAILED)),
        )
    }
}
