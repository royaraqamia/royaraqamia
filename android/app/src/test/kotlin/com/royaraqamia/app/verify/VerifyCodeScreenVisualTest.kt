package com.royaraqamia.app.verify

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.width
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.test.getUnclippedBoundsInRoot
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithContentDescription
import androidx.compose.ui.test.onAllNodesWithTag
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import com.github.takahirom.roborazzi.captureRoboImage
import com.royaraqamia.app.contracts.ApiResult
import com.royaraqamia.app.contracts.generated.VerifyResult
import com.royaraqamia.app.contracts.generated.VerifyResultCertificate
import com.royaraqamia.app.theme.RoyaraqamiaTheme
import java.io.File
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/**
 * The app's half of the visual gate for `/verify/<code>` (#896, ADR-0118).
 *
 * It draws the found certificate at the width the page was recorded at - 393 CSS
 * px, Arabic, RTL, dark - writes every contract element's numbers to
 * `e2e/__visual__/verify-code/at-rest/app.json` and the card's own pixels to
 * `app.png`, and `check:visual` compares them with the page's recording. A number
 * that differs is a failure that names the element and both values.
 *
 * The window is taller than the app's phone here because the card is 975 CSS px:
 * the page capture is an element screenshot, and the app has to draw the whole card
 * to produce the same region. The width, and so every box the contract measures, is
 * still the gate's 393.
 *
 * The certificate is the sample the site itself advertises
 * (`/verify/COMP-2026-UHVW9SG5`), so both clients draw the same names and dates.
 * The boxes are measured; the type sizes and the paddings are read from
 * [VerifyCodeMetrics], the object the screen draws with.
 */
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(
    sdk = [34],
    qualifiers = "ar-rSA-ldrtl-w393dp-h1440dp-440dpi",
    application = android.app.Application::class
)
class VerifyCodeScreenVisualTest {
    @get:Rule val compose = createComposeRule()

    private val certificate =
        VerifyResultCertificate(
            id = "c-1",
            certificate_code = "COMP-2026-UHVW9SG5",
            student_name = "م. أيْهَم العَلي",
            course_name = "تطوير وإدارة المنتجات الرَّقميَّة",
            issue_date = "2026-06-16",
            expiration_date = "2030-06-16",
            grade_or_status = "ممتاز (100/100)",
            created_at = "2026-06-16T00:00:00.000Z",
        )

    @Test
    fun `the screen records the same numbers as the page`() {
        compose.setContent {
            RoyaraqamiaTheme {
                CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Rtl) {
                    Box(Modifier.width(393.dp).fillMaxHeight()) {
                        VerifyCodeScreen(
                            code = certificate.certificate_code,
                            verify = {
                                ApiResult.Success(
                                    VerifyResult(success = true, certificate = certificate)
                                )
                            },
                            siteUrl = "https://royaraqamia.com",
                            onCopy = {},
                            onOpenRoute = {},
                        )
                    }
                }
            }
        }

        compose.waitUntil(10_000) {
            compose
                .onAllNodesWithTag(VerifyCodeMetrics.CARD, useUnmergedTree = true)
                .fetchSemanticsNodes()
                .isNotEmpty()
        }
        // The seal is encoded off the main thread; the capture waits for it so the
        // raster is the card, not the card with an empty QR frame.
        compose.waitUntil(10_000) {
            compose
                .onAllNodesWithContentDescription(
                    "https://royaraqamia.com/verify/COMP-2026-UHVW9SG5",
                    useUnmergedTree = true,
                )
                .fetchSemanticsNodes()
                .isNotEmpty()
        }

        fun top(tag: String) =
            compose.onNodeWithTag(tag, useUnmergedTree = true).getUnclippedBoundsInRoot().top.value
        fun width(tag: String): Float {
            val box = compose.onNodeWithTag(tag, useUnmergedTree = true).getUnclippedBoundsInRoot()
            return (box.right - box.left).value
        }

        fun height(tag: String): Float {
            val box = compose.onNodeWithTag(tag, useUnmergedTree = true).getUnclippedBoundsInRoot()
            return (box.bottom - box.top).value
        }

        val json =
            """
            {
              "surface": "verify-code",
              "elements": {
                "title": {
                  "top": ${top(VerifyCodeMetrics.TITLE)},
                  "height": ${height(VerifyCodeMetrics.TITLE)},
                  "fontSize": ${VerifyCodeMetrics.titleSize.value},
                  "fontWeight": ${VerifyCodeMetrics.titleWeight.weight},
                  "lineHeight": ${VerifyCodeMetrics.titleLineHeight.value}
                },
                "subtitle": {
                  "top": ${top(VerifyCodeMetrics.SUBTITLE)},
                  "height": ${height(VerifyCodeMetrics.SUBTITLE)},
                  "fontSize": ${VerifyCodeMetrics.subtitleSize.value},
                  "lineHeight": ${VerifyCodeMetrics.subtitleLineHeight.value}
                },
                "card": {
                  "top": ${top(VerifyCodeMetrics.CARD)},
                  "width": ${width(VerifyCodeMetrics.CARD)},
                  "height": ${height(VerifyCodeMetrics.CARD)},
                  "radius": ${VerifyCodeMetrics.cardRadius.value}
                },
                "card-header": {
                  "top": ${top(VerifyCodeMetrics.CARD_HEADER)},
                  "width": ${width(VerifyCodeMetrics.CARD_HEADER)},
                  "height": ${height(VerifyCodeMetrics.CARD_HEADER)},
                  "paddingLeft": ${VerifyCodeMetrics.cardHeaderPaddingHorizontal.value},
                  "paddingRight": ${VerifyCodeMetrics.cardHeaderPaddingHorizontal.value}
                },
                "details": {
                  "top": ${top(VerifyCodeMetrics.DETAILS)},
                  "width": ${width(VerifyCodeMetrics.DETAILS)},
                  "rowGap": ${VerifyCodeMetrics.detailGap.value}
                },
                "detail-0": {
                  "top": ${top(VerifyCodeMetrics.detailTag(0))},
                  "width": ${width(VerifyCodeMetrics.detailTag(0))},
                  "height": ${height(VerifyCodeMetrics.detailTag(0))},
                  "radius": ${VerifyCodeMetrics.detailRadius.value}
                },
                "seal": {
                  "top": ${top(VerifyCodeMetrics.SEAL)},
                  "width": ${width(VerifyCodeMetrics.SEAL)},
                  "height": ${height(VerifyCodeMetrics.SEAL)},
                  "radius": ${VerifyCodeMetrics.sealRadius.value}
                },
                "actions": {
                  "top": ${top(VerifyCodeMetrics.ACTIONS)},
                  "width": ${width(VerifyCodeMetrics.ACTIONS)},
                  "height": ${height(VerifyCodeMetrics.ACTIONS)},
                  "rowGap": ${VerifyCodeMetrics.actionGap.value}
                }
              }
            }
            """.trimIndent()

        val dir = File("../../e2e/__visual__/verify-code/at-rest").apply { mkdirs() }
        File(dir, "app.json").writeText("$json\n")
        // The capture is Roborazzi's: it is what settles the frame clock under
        // Robolectric (see CaptureSmokeTest). It writes only in record mode, so
        // the evidence is produced by `-Proborazzi.record=true`.
        compose.onNodeWithTag(VerifyCodeMetrics.CARD, useUnmergedTree = true).captureRoboImage(File(dir, "app.png").path)
    }
}
