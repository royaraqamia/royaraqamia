package com.royaraqamia.app.home

import android.content.Context
import androidx.test.core.app.ApplicationProvider
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/**
 * The door's selection (#1399, ADR-0151, ADR-0156).
 *
 * The address wins, then the remembered tab when the strip still holds it, then
 * the first app the member kept. A remembered tab the strip no longer holds is
 * dropped rather than drawn as a first-run app; an addressed app the strip does
 * not hold is still drawn, because a shared link to a public tool has to land on
 * the tool.
 *
 * The preference is written to the device and read back by a second store, which
 * is what a cold launch does.
 */
@RunWith(RobolectricTestRunner::class)
class HomeDoorTest {
    private lateinit var context: Context

    @Before
    fun setUp() {
        context = ApplicationProvider.getApplicationContext()
        context
            .getSharedPreferences(PreferencesHomeTabStore.PREFERENCES_FILE, Context.MODE_PRIVATE)
            .edit()
            .clear()
            .commit()
    }

    @After
    fun tearDown() {
        context
            .getSharedPreferences(PreferencesHomeTabStore.PREFERENCES_FILE, Context.MODE_PRIVATE)
            .edit()
            .clear()
            .commit()
    }

    @Test
    fun `the address wins over the remembered tab`() {
        assertEquals(
            "/athkar",
            HomeDoor.selected("/athkar", "/rates", listOf("/rates", "/athkar")),
        )
    }

    @Test
    fun `a remembered tab the strip holds is drawn`() {
        assertEquals("/rates", HomeDoor.selected(null, "/rates", listOf("/quran", "/rates")))
    }

    @Test
    fun `a remembered tab the strip lost falls back to the first app`() {
        assertEquals("/quran", HomeDoor.selected(null, "/rates", listOf("/quran", "/notes")))
    }

    @Test
    fun `an addressed app outside the strip is still drawn`() {
        assertEquals("/linksnap", HomeDoor.selected("/linksnap", null, emptyList()))
    }

    @Test
    fun `no address and no apps is the first-run state`() {
        assertNull(HomeDoor.selected(null, null, emptyList()))
    }

    @Test
    fun `the chosen tab survives a restart`() {
        PreferencesHomeTabStore(context).write("/notes")

        assertEquals("/notes", PreferencesHomeTabStore(context).read())
    }
}
