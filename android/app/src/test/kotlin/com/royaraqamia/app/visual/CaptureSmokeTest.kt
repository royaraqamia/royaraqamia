package com.royaraqamia.app.visual

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onRoot
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/**
 * Whether the JVM can draw the app's screens at the viewport the gate pins
 * (#874, ADR-0118).
 *
 * The gate compares two captures of one screen; the page's half is a Playwright
 * screenshot, and this is the app's half — Compose rendered by Robolectric's
 * native graphics at 393 x 852 CSS px at DPR 2.75, which is 1080 x 2343 device
 * pixels (Android truncates the 1080.75 that Chromium rounds up, and the gate
 * compares the shared region).
 *
 * It asserts the size and nothing else: a broken graphics stack fails here by one
 * sentence instead of poisoning every screen's numbers, and a screen's own test —
 * `VerifyScreenVisualTest` — is what writes a capture.
 *
 * Two facts about the stack are encoded here, and both were found the hard way:
 * `captureToImage()` alone never reaches idle under Robolectric, so captures go
 * through Roborazzi; and the app's own `Application` arms a crash handler,
 * Firebase and the sync scheduler whose work keeps the frame clock from settling,
 * so the test runs on a plain one.
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

        val size = compose.onRoot().fetchSemanticsNode().size

        assertEquals("width", 1080, size.width)
        assertEquals("height", 2343, size.height)
    }
}
