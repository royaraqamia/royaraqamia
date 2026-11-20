package com.royaraqamia.app.shell

import android.content.Intent
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/**
 * The Custom Tab the escape hatch opens (#661).
 *
 * The hand-off is one intent, and what makes it a Custom Tab rather than a plain
 * browser tab is the session extra — the one thing a typo would remove silently,
 * leaving a working page in the wrong chrome. `androidx.browser` is not a
 * dependency, so the keys are spelled here and this test is what holds them.
 */
@RunWith(RobolectricTestRunner::class)
class CustomTabTest {
    @Test
    fun `the intent opens the live page in the system browser`() {
        val intent = CustomTab.intentFor("https://royaraqamia.com/rates")

        assertEquals(Intent.ACTION_VIEW, intent.action)
        assertEquals("https://royaraqamia.com/rates", intent.dataString)
    }

    @Test
    fun `the session extra is what asks for a Custom Tab`() {
        val intent = CustomTab.intentFor("https://royaraqamia.com/rates")

        assertTrue(intent.extras?.containsKey(CustomTab.EXTRA_SESSION) == true)
        assertTrue(intent.getBooleanExtra(CustomTab.EXTRA_ENABLE_INSTANT_APPS, false))
    }
}
