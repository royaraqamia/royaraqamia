package com.royaraqamia.app.store

import java.io.File
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder

/**
 * The one public-surface snapshot store (#928).
 *
 * The rule it keeps is in `docs/specs/offline-first.md`; what this test pins is
 * the property that makes it one store rather than a file per screen: the
 * surface key is part of every read and write, so the feed and the rates board
 * on one device cannot overwrite each other.
 */
class PublicSnapshotStoreTest {
    @get:Rule val temporary = TemporaryFolder()

    private fun folder(): File = temporary.newFolder("public")

    @Test
    fun `a saved body is the body that comes back for its surface`() {
        val store = PublicSnapshotStore(folder())
        store.save("rates", """{"base":"USD"}""")

        assertEquals("""{"base":"USD"}""", store.read("rates"))
    }

    @Test
    fun `a second save replaces the first for the same surface`() {
        val folder = folder()
        val store = PublicSnapshotStore(folder)
        store.save("rates", """{"base":"USD"}""")
        store.save("rates", """{"base":"SAR"}""")

        assertEquals("""{"base":"SAR"}""", store.read("rates"))
        assertEquals("the temporary file is not left behind", 1, folder.listFiles()!!.size)
    }

    @Test
    fun `two surfaces keep their own snapshots`() {
        val folder = folder()
        val store = PublicSnapshotStore(folder)
        store.save("community", """{"posts":[]}""")
        store.save("rates", """{"base":"USD"}""")

        assertEquals("""{"posts":[]}""", store.read("community"))
        assertEquals("""{"base":"USD"}""", store.read("rates"))
        assertEquals("one file per surface", 2, folder.listFiles()!!.size)
    }

    @Test
    fun `an unvisited surface reads as no snapshot`() {
        assertNull(PublicSnapshotStore(folder()).read("rates"))
    }

    @Test
    fun `clearing one surface leaves the other`() {
        val store = PublicSnapshotStore(folder())
        store.save("community", """{"posts":[]}""")
        store.save("rates", """{"base":"USD"}""")

        store.clear("rates")

        assertNull(store.read("rates"))
        assertEquals("""{"posts":[]}""", store.read("community"))
    }

    @Test(expected = IllegalArgumentException::class)
    fun `a key that is not a surface id is refused rather than mapped onto another file`() {
        PublicSnapshotStore(folder()).read("../rates")
    }
}
