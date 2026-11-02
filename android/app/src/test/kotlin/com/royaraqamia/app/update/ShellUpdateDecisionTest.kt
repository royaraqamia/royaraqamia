package com.royaraqamia.app.update

import com.royaraqamia.app.ShellUpdate
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Which card a manifest answer asks for (#652).
 *
 * The cases beside `ShellUpdateTest`'s: that file covers what the manifest *says*
 * — parsing, the rollout bucket, the URL it may install from — and this one
 * covers the decision made from it, which is now the whole of the prompt's
 * judgement. The device is the four numbers below, so every rule is one line.
 */
class ShellUpdateDecisionTest {

    /** 1.0.21 installed, which is what the published manifest names. */
    private fun status(json: String, installed: Int = INSTALLED): ShellUpdate.Status =
        ShellUpdate.parse(json, installed, "device-42")

    private fun card(
        json: String,
        installed: Int = INSTALLED,
        floor: Int = 0,
        debug: Boolean = false,
    ): ShellUpdateCard? = ShellUpdateDecision.cardFor(status(json, installed), floor, debug)

    @Test
    fun `a newer release is offered`() {
        val card = card(MANIFEST.replace("20021", "20022").replace("1.0.21", "1.0.22"))

        assertTrue(card is ShellUpdateCard.Offer)
        assertEquals("1.0.22", card?.status?.versionName)
        // The word the card shows about the release is the manifest's, and the
        // decision must carry it rather than a second copy of the number.
        assertEquals("تحسين: تحسينات عامة", card?.status?.notes)
    }

    @Test
    fun `the installed release is not an update`() {
        assertNull(card(MANIFEST))
    }

    @Test
    fun `a release older than the installed one is silence`() {
        assertNull(card(MANIFEST, installed = 20030))
    }

    @Test
    fun `a floor above the installed build is required, with no newer release`() {
        val card = card(MANIFEST.replace("\"minSupportedVersionCode\": 20000", "\"minSupportedVersionCode\": 20030"))

        assertTrue(card is ShellUpdateCard.Required)
    }

    @Test
    fun `a 426 floor is merged into a manifest that lags it`() {
        // The manifest still names the old floor and the installed build: the
        // server's answer is the newer fact, and the card has to believe it.
        assertNull(card(MANIFEST))
        assertTrue(card(MANIFEST, floor = 20030) is ShellUpdateCard.Required)
    }

    @Test
    fun `the floor ignores the rollout`() {
        val excluded =
            MANIFEST.replace("20021", "20030")
                .replace("1.0.21", "1.0.30")
                .replace("\"minSupportedVersionCode\": 20000", "\"minSupportedVersionCode\": 20030")
                .replace("\"rollout\": 100", "\"rollout\": 0")

        // No device is in a 0% cohort, and a floor is not a cohort.
        assertTrue(card(excluded) is ShellUpdateCard.Required)
    }

    @Test
    fun `a release this device is not in the cohort of says nothing`() {
        val excluded =
            MANIFEST.replace("20021", "20030")
                .replace("1.0.21", "1.0.30")
                .replace("\"rollout\": 100", "\"rollout\": 0")

        assertNull(card(excluded))
    }

    @Test
    fun `an uninstallable manifest is silence even below the floor`() {
        // Nothing may be offered that this app would refuse to fetch: the safe
        // direction is a working app, never a blocked one with no way out.
        val uninstallable =
            MANIFEST.replace("\"apkUrl\": \"https://royaraqamia.com/shell.apk\"", "\"apkUrl\": \"file:///sdcard/shell.apk\"")
                .replace("\"minSupportedVersionCode\": 20000", "\"minSupportedVersionCode\": 20030")

        assertNull(card(uninstallable))
    }

    @Test
    fun `cleartext is offered in a debug build and refused in a release one`() {
        val dev =
            MANIFEST.replace("20021", "20022")
                .replace("1.0.21", "1.0.22")
                .replace("https://royaraqamia.com/shell.apk", "http://10.0.2.2:3000/shell.apk")

        assertTrue(card(dev, debug = true) is ShellUpdateCard.Offer)
        assertNull(card(dev, debug = false))
    }

    @Test
    fun `nothing has answered yet is silence`() {
        assertNull(ShellUpdateDecision.cardFor(null, 20030, false))
    }

    private companion object {
        const val INSTALLED = 20021

        const val MANIFEST =
            "{\"versionCode\": 20021, \"versionName\": \"1.0.21\", " +
                "\"apkUrl\": \"https://royaraqamia.com/shell.apk\", " +
                "\"sha256\": \"f654ea26c65dde3c82aab6c788cd51ae5bd6a30da9cfbbe53aac74edb73d0623\", " +
                "\"sizeBytes\": 10696865, \"minSupportedVersionCode\": 20000, \"rollout\": 100, " +
                "\"notes\": \"تحسين: تحسينات عامة\"}"
    }
}
