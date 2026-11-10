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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.github.takahirom.roborazzi.captureRoboImage
import com.royaraqamia.app.contracts.generated.LinksnapAnalyticsResponseAnalytics
import com.royaraqamia.app.contracts.generated.LinksnapAnalyticsResponseAnalyticsDevice
import com.royaraqamia.app.contracts.generated.LinksnapAnalyticsResponseAnalyticsDeviceBrowsersItem
import com.royaraqamia.app.contracts.generated.LinksnapAnalyticsResponseAnalyticsDeviceDevicesItem
import com.royaraqamia.app.contracts.generated.LinksnapAnalyticsResponseAnalyticsDeviceOsItem
import com.royaraqamia.app.contracts.generated.LinksnapAnalyticsResponseAnalyticsTopReferrersItem
import com.royaraqamia.app.store.linksnap.LinksnapLinkRow
import com.royaraqamia.app.theme.RoyaraqamiaTheme
import com.royaraqamia.app.verify.VerifyQrCode
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

    /**
     * The QR dialog the row's action opens (#943).
     *
     * The dialog encodes the same short URL the page's fixture records, with the
     * page's own encoder parameters (error correction M, a one-module quiet
     * zone), and is drawn in its ready face. The contract measures the header and
     * its words; the matrix is the encoder's output and is not a measured box,
     * because Chromium's and Skia's rasterisation of a dense matrix never agree
     * pixel for pixel.
     */
    @Test
    fun `the qr dialog records the same numbers as the page`() {
        val shortUrl = "http://localhost:3000/${row.code}"
        val matrix = VerifyQrCode.matrix(shortUrl, size = 240, quietZone = 1)
        checkNotNull(matrix) { "the fixture URL must encode" }

        compose.setContent {
            RoyaraqamiaTheme {
                CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Rtl) {
                    Box(Modifier.width(393.dp).fillMaxHeight()) {
                        LinksnapQrContent(
                            shortUrl = shortUrl,
                            state = LinksnapQrUiState.Ready(matrix),
                            onRetry = {},
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
                "title": {
                  "height": ${height(LinksnapQrMetrics.TITLE)},
                  "fontSize": ${LinksnapQrMetrics.titleSize.value},
                  "fontWeight": 700,
                  "lineHeight": ${LinksnapQrMetrics.titleLineHeight.value}
                },
                "description": {
                  "height": ${height(LinksnapQrMetrics.DESCRIPTION)},
                  "fontSize": ${LinksnapQrMetrics.descriptionSize.value},
                  "lineHeight": ${LinksnapQrMetrics.descriptionLineHeight.value}
                },
                "url-label": {
                  "height": ${height(LinksnapQrMetrics.URL_LABEL)},
                  "fontSize": ${LinksnapQrMetrics.urlTextSize.value},
                  "fontWeight": ${500}
                },
                "url": {
                  "height": ${height(LinksnapQrMetrics.URL)},
                  "fontSize": ${LinksnapQrMetrics.urlTextSize.value},
                  "fontWeight": ${700}
                },
                "header": {
                  "width": ${width(LinksnapQrMetrics.HEADER)},
                  "height": ${height(LinksnapQrMetrics.HEADER)}
                },
                "url-line": {
                  "height": ${height(LinksnapQrMetrics.URL_LINE)},
                  "width": ${width(LinksnapQrMetrics.URL_LINE)},
                  "radius": ${LinksnapQrMetrics.urlLineRadius.value},
                  "paddingTop": ${LinksnapQrMetrics.urlLinePaddingY.value},
                  "paddingLeft": ${LinksnapQrMetrics.urlLinePaddingX.value},
                  "rowGap": ${LinksnapQrMetrics.columnGap.value},
                  "columnGap": ${LinksnapQrMetrics.columnGap.value}
                }
              }
            }
            """.trimIndent()

        val dir = File("../../e2e/__visual__/account-links/qr").apply { mkdirs() }
        File(dir, "app.json").writeText("$json\n")
        compose
            .onNodeWithTag(LinksnapQrMetrics.HEADER, useUnmergedTree = true)
            .captureRoboImage(File(dir, "app.png").path)
    }

    /**
     * The edit dialog the row's action opens (#944).
     *
     * The dialog is drawn in its resting face on the fixture row: the header
     * carries the page's title and instruction, and that header is what the
     * contract measures and captures. The rest of the form is the page's own
     * fields, written through the store by the adapter rather than by the gate.
     */
    @Test
    fun `the edit dialog records the same numbers as the page`() {
        compose.setContent {
            RoyaraqamiaTheme {
                CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Rtl) {
                    Box(Modifier.width(393.dp).fillMaxHeight()) {
                        LinksnapEditContent(
                            row = row,
                            siteUrl = "http://localhost:3000",
                            online = true,
                            onDismiss = {},
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
                "title": {
                  "height": ${height(LinksnapEditMetrics.TITLE)},
                  "fontSize": ${LinksnapEditMetrics.titleSize.value},
                  "fontWeight": ${FontWeight.Bold.weight},
                  "lineHeight": ${LinksnapEditMetrics.titleLineHeight.value}
                },
                "description": {
                  "height": ${height(LinksnapEditMetrics.DESCRIPTION)},
                  "fontSize": ${LinksnapEditMetrics.descriptionSize.value},
                  "lineHeight": ${LinksnapEditMetrics.descriptionLineHeight.value}
                },
                "header": {
                  "width": ${width(LinksnapEditMetrics.HEADER)},
                  "height": ${height(LinksnapEditMetrics.HEADER)}
                }
              }
            }
            """.trimIndent()

        val dir = File("../../e2e/__visual__/account-links/edit").apply { mkdirs() }
        File(dir, "app.json").writeText("$json\n")
        compose
            .onNodeWithTag(LinksnapEditMetrics.HEADER, useUnmergedTree = true)
            .captureRoboImage(File(dir, "app.png").path)
    }

    /**
     * The analytics drawer under the row (#962).
     *
     * The drawer's content is drawn in its filled face on the same fixture row;
     * the contract measures the three range presets and the capture is the group,
     * because the rest of the drawer is a list of server-owned numbers whose
     * boxes are not a design decision. The chart (#963) and the CSV export (#964)
     * are the next slices and are not drawn.
     */
    @Test
    fun `the analytics drawer records the same numbers as the page`() {
        val summary =
            LinksnapAnalyticsResponseAnalytics(
                totalClicks = 3,
                recentClicks = emptyList(),
                clicksByDate = emptyList(),
                topReferrers =
                    listOf(
                        LinksnapAnalyticsResponseAnalyticsTopReferrersItem(
                            name = "example.com",
                            count = 3,
                        )
                    ),
                device =
                    LinksnapAnalyticsResponseAnalyticsDevice(
                        devices =
                            listOf(
                                LinksnapAnalyticsResponseAnalyticsDeviceDevicesItem(
                                    name = "جوال",
                                    count = 3,
                                    percent = 100,
                                )
                            ),
                        os =
                            listOf(
                                LinksnapAnalyticsResponseAnalyticsDeviceOsItem(
                                    name = "Android",
                                    count = 3,
                                    percent = 100,
                                )
                            ),
                        browsers =
                            listOf(
                                LinksnapAnalyticsResponseAnalyticsDeviceBrowsersItem(
                                    name = "Chrome",
                                    count = 3,
                                    percent = 100,
                                )
                            ),
                    ),
            )

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
                            analyticsCode = row.code,
                            analyticsState = LinksnapAnalyticsUiState.Ready(summary),
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
                "presets": {
                  "width": ${width(LinksnapAnalyticsMetrics.PRESETS)},
                  "height": ${height(LinksnapAnalyticsMetrics.PRESETS)},
                  "radius": ${LinksnapAnalyticsMetrics.presetsRadius.value},
                  "paddingTop": ${LinksnapAnalyticsMetrics.presetsPadding.value},
                  "paddingLeft": ${LinksnapAnalyticsMetrics.presetsPadding.value},
                  "rowGap": ${LinksnapAnalyticsMetrics.presetGap.value},
                  "columnGap": ${LinksnapAnalyticsMetrics.presetGap.value}
                },
                "preset-7": {
                  "height": ${height(LinksnapAnalyticsMetrics.presetTag(LinksnapAnalyticsRange.Last7Days))},
                  "fontSize": ${LinksnapAnalyticsMetrics.presetSize.value},
                  "fontWeight": ${FontWeight.Bold.weight},
                  "radius": ${LinksnapAnalyticsMetrics.presetRadius.value},
                  "paddingTop": ${LinksnapAnalyticsMetrics.presetPaddingY.value},
                  "paddingLeft": ${LinksnapAnalyticsMetrics.presetPaddingX.value}
                },
                "preset-30": {
                  "height": ${height(LinksnapAnalyticsMetrics.presetTag(LinksnapAnalyticsRange.Last30Days))},
                  "fontSize": ${LinksnapAnalyticsMetrics.presetSize.value},
                  "fontWeight": ${FontWeight.Bold.weight},
                  "radius": ${LinksnapAnalyticsMetrics.presetRadius.value},
                  "paddingTop": ${LinksnapAnalyticsMetrics.presetPaddingY.value},
                  "paddingLeft": ${LinksnapAnalyticsMetrics.presetPaddingX.value}
                },
                "preset-90": {
                  "height": ${height(LinksnapAnalyticsMetrics.presetTag(LinksnapAnalyticsRange.Last90Days))},
                  "fontSize": ${LinksnapAnalyticsMetrics.presetSize.value},
                  "fontWeight": ${FontWeight.Bold.weight},
                  "radius": ${LinksnapAnalyticsMetrics.presetRadius.value},
                  "paddingTop": ${LinksnapAnalyticsMetrics.presetPaddingY.value},
                  "paddingLeft": ${LinksnapAnalyticsMetrics.presetPaddingX.value}
                }
              }
            }
            """.trimIndent()

        val dir = File("../../e2e/__visual__/account-links/analytics").apply { mkdirs() }
        File(dir, "app.json").writeText("$json\n")
        compose
            .onNodeWithTag(LinksnapAnalyticsMetrics.PRESETS, useUnmergedTree = true)
            .captureRoboImage(File(dir, "app.png").path)
    }

}
