package com.royaraqamia.app.visual

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onRoot
import com.github.takahirom.roborazzi.captureRoboImage
import java.io.File
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/**
 * Whether the JVM can draw the app's screens at all (#874, ADR-0118).
 *
 * The visual gate compares two captures of one screen; the page's half is a
 * Playwright screenshot, and this is the app's half — Compose rendered by
 * Robolectric's native graphics at the viewport the gate pins, 393 x 852 CSS px at
 * DPR 2.75, which is 1081 x 2343 device pixels.
 *
 * Two things had to be worked around to get here, and both are facts about the
 * stack rather than about this screen:
 *
 * - `captureToImage()` alone never reaches idle under Robolectric, so the capture
 *   goes through Roborazzi, which drives the frame clock;
 * - the app's own `Application` arms a crash handler, Firebase and the sync
 *   scheduler, and their work keeps that clock from settling, so this runs on a
 *   plain `Application`.
 *
 * It asserts the size and nothing else, so a broken graphics stack fails here by
 * one sentence instead of poisoning every screen's numbers.
 */
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(
    sdk = [34],
    qualifiers = "ar-rSA-ldrtl-w393dp-h852dp-440dpi",
    application = android.app.Application::class
)
class CaptureSmokeTest {
    @get:Rule val compose = createComposeRule()

    @Test
    fun `compose draws at the gate's viewport`() {
        compose.setContent {
            Box(Modifier.fillMaxSize().background(Color.Red))
        }

        val out = File("build/visual/capture-smoke.png")
        out.parentFile?.mkdirs()
        compose.onRoot().captureRoboImage(out.path)

        val bitmap = android.graphics.BitmapFactory.decodeFile(out.path)
        requireNotNull(bitmap) { "the capture was not written to ${out.path}" }

        // 393 x 2.75 = 1080.75, which Android truncates to 1080 while Chromium
        // rounds it to 1081, and 852 x 2.75 = 2343 exactly. The gate compares the
        // shared region, so that one pixel is the toolchains, not the design.
        assertEquals("width", 1080, bitmap.width)
        assertEquals("height", 2343, bitmap.height)
    }
}
