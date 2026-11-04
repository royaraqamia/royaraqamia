package com.royaraqamia.app.quran

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment

/**
 * Where the reader stopped survives the process (#955).
 *
 * A new store over the same application is the closest a JVM test gets to a
 * process kill: the value is not in the object that wrote it, it is on disk.
 */
@RunWith(RobolectricTestRunner::class)
class QuranPositionStoreTest {
    @Test
    fun `a position is still there for the next process`() {
        val context = RuntimeEnvironment.getApplication()
        val first = PreferencesQuranPositionStore(context)
        assertNull(first.read())

        first.write(QuranReadingPosition(surah = 2, ayah = 255, updatedAt = "2026-11-04T00:00:00Z"))

        val next = PreferencesQuranPositionStore(context)
        val restored = requireNotNull(next.read())
        assertEquals(2, restored.surah)
        assertEquals(255, restored.ayah)
        assertEquals("2026-11-04T00:00:00Z", restored.updatedAt)
    }

    @Test
    fun `an out-of-range position is not a position`() {
        val context = RuntimeEnvironment.getApplication()
        val store = PreferencesQuranPositionStore(context)
        store.write(QuranReadingPosition(surah = 115, ayah = 1, updatedAt = "now"))
        assertNull(PreferencesQuranPositionStore(context).read())
    }
}
