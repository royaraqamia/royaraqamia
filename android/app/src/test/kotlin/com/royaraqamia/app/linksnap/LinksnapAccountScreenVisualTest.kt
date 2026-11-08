package com.royaraqamia.app.linksnap

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
import com.royaraqamia.app.store.linksnap.LinksnapLinkRow
import com.royaraqamia.app.theme.RoyaraqamiaTheme
import java.io.File
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/**
 * The app's half of the visual gate for `/account/links` (#941, ADR-0118).
 *
 * It draws the owned-link list at rest at the viewport the page was recorded at
 * - 393 x 852 CSS px, Arabic, RTL, dark - writes every contract element's numbers
 * to `e2e/__visual__/account-links/at-rest/app.json`, and captures the
 * destination line to `app.png`; `check:visual` compares them with the page's
 * recording. A number that differs is a failure that names the element and both
 * values.
 *
 * The fixture row carries a password so the state draws the protected pill the
 * page's row draws. The selection checkbox, the row's toolbar and its dialogs
 * are the next slices (#942, #943, #944) and are outside this contract.
 *
 * The boxes are measured; the type sizes, paddings and the line height are read
 * from [LinksnapRowMetrics], the object the row draws with, because Compose does
 * not expose resolved typography through the semantics tree. The raster is what
 * proves the type and the colours actually landed as declared.
 */
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(
    sdk = [34],
    qualifiers = "ar-rSA-ldrtl-w393dp-h852dp-440dpi",
    application = android.app.Application::class
)
class LinksnapAccountScreenVisualTest {
    @get:Rule val compose = createComposeRule()

    private val row =
        LinksnapLinkRow(
            clientId = "client-1",
            code = "e2e-visual-gate",
            originalUrl = "https://example.com/visual-gate",
            createdAt = "2026-11-08T10:00:00.000Z",
            updatedAt = "2026-11-08T10:00:00.000Z",
            expiresAt = null,
            isBlocked = false,
            passwordProtected = true,
            deletedAt = null,
        )

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

    @Test
    fun `the row at rest records the same numbers as the page`() {
        compose.setContent {
            RoyaraqamiaTheme {
                CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Rtl) {
                    Box(Modifier.width(393.dp).fillMaxHeight()) {
                        LinksnapAccountList(
                            rows = listOf(row),
                            pill = null,
                            signedIn = true,
                            onRetry = {},
                            onSignIn = {},
                        )
                    }
                }
            }
        }

        val json =
            """
            {
              "surface": "account-links",
              "elements": {
                "code": {
                  "height": ${height(LinksnapRowMetrics.CODE)},
                  "fontSize": ${LinksnapRowMetrics.codeTextSize.value},
                  "fontWeight": ${LinksnapRowMetrics.codeWeight.weight},
                  "radius": ${LinksnapRowMetrics.codeRadius.value},
                  "paddingTop": ${LinksnapRowMetrics.codePaddingY.value},
                  "paddingLeft": ${LinksnapRowMetrics.codePaddingX.value}
                },
                "status": {
                  "height": ${height(LinksnapRowMetrics.STATUS)},
                  "fontSize": ${LinksnapRowMetrics.pillTextSize.value},
                  "fontWeight": ${LinksnapRowMetrics.pillWeight.weight},
                  "paddingTop": ${LinksnapRowMetrics.pillPaddingY.value},
                  "paddingLeft": ${LinksnapRowMetrics.pillPaddingX.value}
                },
                "protected": {
                  "height": ${height(LinksnapRowMetrics.PROTECTED)},
                  "fontSize": ${LinksnapRowMetrics.pillTextSize.value},
                  "fontWeight": ${LinksnapRowMetrics.pillWeight.weight},
                  "paddingTop": ${LinksnapRowMetrics.pillPaddingY.value},
                  "paddingLeft": ${LinksnapRowMetrics.pillPaddingX.value}
                },
                "date": {
                  "height": ${height(LinksnapRowMetrics.DATE)},
                  "fontSize": ${LinksnapRowMetrics.pillTextSize.value},
                  "paddingTop": ${LinksnapRowMetrics.pillPaddingY.value},
                  "paddingLeft": ${LinksnapRowMetrics.pillPaddingX.value}
                },
                "destination": {
                  "width": ${width(LinksnapRowMetrics.DESTINATION)},
                  "height": ${height(LinksnapRowMetrics.DESTINATION)},
                  "fontSize": ${LinksnapRowMetrics.destinationSize.value},
                  "lineHeight": ${LinksnapRowMetrics.destinationLineHeight.value}
                }
              }
            }
            """.trimIndent()

        val dir = File("../../e2e/__visual__/account-links/at-rest").apply { mkdirs() }
        File(dir, "app.json").writeText("$json\n")
        // The capture is Roborazzi's: it is what settles the frame clock under
        // Robolectric. It writes only in record mode, so the evidence is
        // produced by `-Proborazzi.record=true`.
        compose
            .onNodeWithTag(LinksnapRowMetrics.DESTINATION, useUnmergedTree = true)
            .captureRoboImage(File(dir, "app.png").path)
    }

    @Test
    fun `the bulk bar records the same numbers as the page`() {
        compose.setContent {
            RoyaraqamiaTheme {
                CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Rtl) {
                    Box(Modifier.width(393.dp).fillMaxHeight()) {
                        LinksnapAccountList(
                            rows = listOf(row),
                            pill = null,
                            signedIn = true,
                            onRetry = {},
                            onSignIn = {},
                            selectedCodes = setOf(row.code),
                            allSelected = true,
                        )
                    }
                }
            }
        }

        val json =
            """
            {
              "surface": "account-links",
              "elements": {
                "bar": {
                  "width": ${width(LinksnapBulkBarMetrics.BAR)},
                  "height": ${height(LinksnapBulkBarMetrics.BAR)},
                  "radius": ${LinksnapBulkBarMetrics.radius.value},
                  "paddingTop": ${LinksnapBulkBarMetrics.designPadding},
                  "paddingLeft": ${LinksnapBulkBarMetrics.designPadding},
                  "rowGap": ${LinksnapBulkBarMetrics.gap.value},
                  "columnGap": ${LinksnapBulkBarMetrics.gap.value}
                },
                "select-all": {
                  "height": ${height(LinksnapBulkBarMetrics.SELECT_ALL)},
                  "fontSize": ${LinksnapBulkBarMetrics.textSize.value},
                  "fontWeight": ${LinksnapBulkBarMetrics.text.fontWeight?.weight}
                },
                "checkbox": {
                  "width": ${width(LinksnapBulkBarMetrics.CHECKBOX)},
                  "height": ${height(LinksnapBulkBarMetrics.CHECKBOX)},
                  "radius": ${LinksnapBulkBarMetrics.checkboxRadius.value}
                },
                "count": {
                  "height": ${height(LinksnapBulkBarMetrics.COUNT)},
                  "fontSize": ${LinksnapBulkBarMetrics.textSize.value}
                },
                "clear": {
                  "height": ${height(LinksnapBulkBarMetrics.CLEAR)},
                  "fontSize": ${LinksnapBulkBarMetrics.textSize.value},
                  "fontWeight": ${LinksnapBulkBarMetrics.text.fontWeight?.weight},
                  "paddingTop": ${LinksnapBulkBarMetrics.designButtonPaddingTop},
                  "paddingLeft": ${LinksnapBulkBarMetrics.buttonPaddingX.value}
                },
                "copy": {
                  "height": ${height(LinksnapBulkBarMetrics.COPY)},
                  "fontSize": ${LinksnapBulkBarMetrics.textSize.value},
                  "fontWeight": ${LinksnapBulkBarMetrics.text.fontWeight?.weight},
                  "paddingTop": ${LinksnapBulkBarMetrics.designButtonPaddingTop},
                  "paddingLeft": ${LinksnapBulkBarMetrics.buttonPaddingX.value}
                },
                "expiry": {
                  "height": ${height(LinksnapBulkBarMetrics.EXPIRY)},
                  "fontSize": ${LinksnapBulkBarMetrics.textSize.value},
                  "fontWeight": ${LinksnapBulkBarMetrics.text.fontWeight?.weight},
                  "paddingTop": ${LinksnapBulkBarMetrics.designButtonPaddingTop},
                  "paddingLeft": ${LinksnapBulkBarMetrics.buttonPaddingX.value}
                },
                "delete": {
                  "height": ${height(LinksnapBulkBarMetrics.DELETE)},
                  "fontSize": ${LinksnapBulkBarMetrics.textSize.value},
                  "fontWeight": ${LinksnapBulkBarMetrics.text.fontWeight?.weight},
                  "paddingTop": ${LinksnapBulkBarMetrics.designButtonPaddingTop},
                  "paddingLeft": ${LinksnapBulkBarMetrics.buttonPaddingX.value}
                }
              }
            }
            """.trimIndent()

        val dir = File("../../e2e/__visual__/account-links/bulk-bar").apply { mkdirs() }
        File(dir, "app.json").writeText("$json\n")
        compose
            .onNodeWithTag(LinksnapBulkBarMetrics.BAR, useUnmergedTree = true)
            .captureRoboImage(File(dir, "app.png").path)
    }
}
