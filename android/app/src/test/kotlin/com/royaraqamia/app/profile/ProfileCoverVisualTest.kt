package com.royaraqamia.app.profile

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.requiredWidth
import androidx.compose.ui.Modifier
import androidx.compose.ui.test.assertHeightIsEqualTo
import androidx.compose.ui.test.assertWidthIsEqualTo
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.unit.dp
import com.royaraqamia.app.theme.RoyaraqamiaTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/**
 * The band's geometry at the two widths the page gives it (#1564).
 *
 * The cover is outside the visual contract (`profile-header` is measured on
 * width and radius only), so these two measurements are the local proof that
 * the app draws the band at the height the page does. The shared test tag is
 * what lets the test find the same box on both sides.
 */
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(
    sdk = [34],
    qualifiers = "ar-rSA-ldrtl-w393dp-h852dp-440dpi",
    application = android.app.Application::class,
)
class ProfileCoverVisualTest {
    @get:Rule val compose = createComposeRule()

    private fun draw(width: androidx.compose.ui.unit.Dp) {
        compose.setContent {
            RoyaraqamiaTheme {
                Box(Modifier.requiredWidth(width)) {
                    ProfileCover(memberId = "a1b2c3d4-1111-4aaa-9bbb-000000000001")
                }
            }
        }
    }

    @Test
    fun `the band is 132dp at the phone width`() {
        draw(393.dp)
        compose
            .onNodeWithTag(ProfileCoverCopy.TAG)
            .assertWidthIsEqualTo(393.dp)
            .assertHeightIsEqualTo(132.dp)
    }

    @Test
    fun `the band grows to 160dp where the page switches to sm`() {
        draw(640.dp)
        compose.onNodeWithTag(ProfileCoverCopy.TAG).assertHeightIsEqualTo(160.dp)
    }
}
