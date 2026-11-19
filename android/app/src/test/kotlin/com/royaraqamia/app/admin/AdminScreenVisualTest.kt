package com.royaraqamia.app.admin

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.width
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.test.getUnclippedBoundsInRoot
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import com.github.takahirom.roborazzi.captureRoboImage
import com.royaraqamia.app.theme.RoyaraqamiaTheme
import java.io.File
import org.json.JSONObject
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/**
 * The app's half of the visual gate for `/admin` (#1627, ADR-0118).
 *
 * It composes the console index at the viewport the page was recorded at - 393 x
 * 852 CSS px, Arabic, RTL, dark, reduced motion - and writes every named
 * element's box and style to `app.json` and the contract's capture region to
 * `app.png`. `check:visual` compares them with the page's recording. The boxes
 * are measured; the type sizes and the card's radius are read from
 * [AdminMetrics], the object the screen draws with.
 *
 * The page is an admin's, so there is no fixture row behind it: the console index
 * is ten static section cards from the shared copy, and the composed screen is
 * the same ten the server-authorized route would draw.
 */
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(
    sdk = [34],
    qualifiers = "ar-rSA-ldrtl-w393dp-h852dp-440dpi",
    application = android.app.Application::class,
)
class AdminScreenVisualTest {
    @get:Rule val compose = createComposeRule()

    private fun compose() {
        compose.setContent {
            RoyaraqamiaTheme {
                CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Rtl) {
                    Box(Modifier.width(393.dp).fillMaxHeight()) {
                        AdminScreen(onOpenRoute = {})
                    }
                }
            }
        }
    }

    private fun top(tag: String) =
        compose.onNodeWithTag(tag, useUnmergedTree = true).getUnclippedBoundsInRoot().top.value

    private fun width(tag: String): Float {
        val box = compose.onNodeWithTag(tag, useUnmergedTree = true).getUnclippedBoundsInRoot()
        return (box.right - box.left).value
    }

    private fun height(tag: String): Float {
        val box = compose.onNodeWithTag(tag, useUnmergedTree = true).getUnclippedBoundsInRoot()
        return (box.bottom - box.top).value
    }

    private fun record(capture: String, elements: String) {
        val json = JSONObject("""{"surface":"admin","elements":{$elements}}""").toString(2)
        val dir = File("../../e2e/__visual__/admin/at-rest").apply { mkdirs() }
        File(dir, "app.json").writeText("$json\n")
        compose
            .onNodeWithTag(capture, useUnmergedTree = true)
            .captureRoboImage(File(dir, "app.png").path)
    }

    @Test
    fun `the console index records the page's title and cards`() {
        compose()

        record(
            capture = AdminMetrics.section("certificates"),
            elements =
                """
                "title": {
                  "top": ${top(AdminMetrics.TITLE)},
                  "height": ${height(AdminMetrics.TITLE)},
                  "fontSize": ${AdminMetrics.titleSize.value},
                  "fontWeight": ${AdminMetrics.titleWeight.weight}
                },
                "list": {
                  "top": ${top(AdminMetrics.LIST)},
                  "width": ${width(AdminMetrics.LIST)}
                },
                "section-certificates": {
                  "top": ${top(AdminMetrics.section("certificates"))},
                  "width": ${width(AdminMetrics.section("certificates"))},
                  "height": ${height(AdminMetrics.section("certificates"))},
                  "radius": ${AdminMetrics.cardRadius.value}
                },
                "section-reports": {
                  "width": ${width(AdminMetrics.section("reports"))},
                  "height": ${height(AdminMetrics.section("reports"))},
                  "radius": ${AdminMetrics.cardRadius.value}
                }
                """,
        )
    }
}
