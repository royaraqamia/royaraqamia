package com.royaraqamia.app.scan

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.width
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.test.getUnclippedBoundsInRoot
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithTag
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
 * The app's half of the visual gate for `/scan` (#1344, ADR-0118).
 *
 * It draws the scanner's own [ScanView] - the component the shipping screen hands
 * its state to - at the width the page is recorded at, 393 CSS px, Arabic, RTL,
 * dark. The camera itself is a live MediaStream and cannot be a recording, so the
 * three states are the frame and the cards around it: `at-rest` with the camera
 * not started, `denied` with the page's own permission sentence, and `result`
 * with the fixture payload both decoders read. Each writes its numbers to
 * `e2e/__visual__/scan/<state>/app.json` and the contract's capture region to
 * `app.png`; `check:visual` compares them with the page's recording.
 */
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(
    sdk = [34],
    qualifiers = "ar-rSA-ldrtl-w393dp-h852dp-440dpi",
    application = android.app.Application::class
)
class ScanScreenVisualTest {
    @get:Rule val compose = createComposeRule()

    private fun compose(state: ScanViewState) {
        compose.setContent {
            RoyaraqamiaTheme {
                CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Rtl) {
                    Box(Modifier.width(393.dp).fillMaxHeight()) {
                        ScanView(
                            state = state,
                            siteUrl = "https://royaraqamia.com",
                            onStart = {},
                            onStop = {},
                            onTorch = {},
                            onUpload = {},
                            onRescan = {},
                            onOpenRoute = {},
                            onOpenExternal = {},
                            onCopy = {},
                        )
                    }
                }
            }
        }
    }

    private fun bounds(tag: String) =
        compose.onNodeWithTag(tag, useUnmergedTree = true).getUnclippedBoundsInRoot()

    private fun top(tag: String) = bounds(tag).top.value
    private fun width(tag: String) = (bounds(tag).right - bounds(tag).left).value
    private fun height(tag: String) = (bounds(tag).bottom - bounds(tag).top).value

    private fun record(surface: String, state: String, captureTag: String, elements: String) {
        val json =
            JSONObject("""{"surface":"$surface","elements":{$elements}}""").toString(2)

        val dir = File("../../e2e/__visual__/scan/$state").apply { mkdirs() }
        File(dir, "app.json").writeText("$json\n")
        compose.onNodeWithTag(captureTag, useUnmergedTree = true).captureRoboImage(
            File(dir, "app.png").path
        )
    }

    private fun frameElements() =
        """
        "title": {
          "top": ${top(ScanMetrics.TITLE)},
          "height": ${height(ScanMetrics.TITLE)},
          "fontSize": ${ScanMetrics.titleSize.value},
          "fontWeight": ${ScanMetrics.titleWeight.weight},
          "lineHeight": ${ScanMetrics.titleLineHeight.value}
        },
        "card": {
          "top": ${top(ScanMetrics.CARD)},
          "width": ${width(ScanMetrics.CARD)},
          "height": ${height(ScanMetrics.CARD)},
          "radius": ${ScanMetrics.cardRadius.value}
        },
        "viewfinder": {
          "top": ${top(ScanMetrics.VIEWFINDER)},
          "width": ${width(ScanMetrics.VIEWFINDER)},
          "height": ${height(ScanMetrics.VIEWFINDER)},
          "radius": ${ScanMetrics.viewfinderRadius.value}
        },
        "start": {
          "height": ${height(ScanMetrics.START)},
          "fontSize": ${ScanMetrics.buttonTextSize},
          "fontWeight": ${ScanMetrics.buttonTextWeight}
        },
        "upload": {
          "top": ${top(ScanMetrics.UPLOAD)},
          "width": ${width(ScanMetrics.UPLOAD)},
          "height": ${height(ScanMetrics.UPLOAD)},
          "radius": ${ScanMetrics.uploadRadius.value}
        },
        "upload-hint": {
          "top": ${top(ScanMetrics.UPLOAD_HINT)},
          "height": ${height(ScanMetrics.UPLOAD_HINT)},
          "fontSize": ${ScanMetrics.hintTextSize}
        },
        "upload-button": {
          "height": ${height(ScanMetrics.UPLOAD_BUTTON)},
          "fontSize": ${ScanMetrics.buttonTextSize}
        }
        """


    private fun state(message: String? = null) =
        ScanViewState(
            status = ScanStatus.Idle,
            message = message,
            hit = null,
            busy = false,
            hasCamera = true,
            torchAvailable = false,
            torchOn = false,
        )

    @Test
    fun `the scanner at rest records the page's boxes`() {
        compose(state())
        record("scan", "at-rest", ScanMetrics.CARD, frameElements())
    }

    @Test
    fun `the denied scanner records the page's boxes and its sentence`() {
        compose(state(message = ScanMessages.PERMISSION_DENIED))
        val notice =
            """
            "notice": {
              "top": ${top(ScanMetrics.NOTICE)},
              "width": ${width(ScanMetrics.NOTICE)},
              "height": ${height(ScanMetrics.NOTICE)},
              "radius": ${ScanMetrics.noticeRadius.value},
              "fontSize": ${ScanMetrics.noticeTextSize}
            }
            """
        record("scan", "denied", ScanMetrics.CARD, frameElements() + ",\n" + notice)
    }

    @Test
    fun `the result records the page's boxes for the fixture payload`() {
        compose(
            state().copy(
                status = ScanStatus.Result,
                hit = ScanHit(ScanMessages.FIXTURE_PAYLOAD, "QR_CODE"),
            )
        )
        val elements =
            """
            "title": {
              "top": ${top(ScanMetrics.TITLE)},
              "height": ${height(ScanMetrics.TITLE)},
              "fontSize": ${ScanMetrics.titleSize.value},
              "fontWeight": ${ScanMetrics.titleWeight.weight},
              "lineHeight": ${ScanMetrics.titleLineHeight.value}
            },
            "result-card": {
              "top": ${top(ScanMetrics.RESULT_CARD)},
              "width": ${width(ScanMetrics.RESULT_CARD)},
              "height": ${height(ScanMetrics.RESULT_CARD)},
              "radius": ${ScanMetrics.cardRadius.value}
            },
            "result-badges": {
              "top": ${top(ScanMetrics.RESULT_BADGES)},
              "height": ${height(ScanMetrics.RESULT_BADGES)},
              "columnGap": 8
            },
            "result-payload": {
              "top": ${top(ScanMetrics.RESULT_PAYLOAD)},
              "height": ${height(ScanMetrics.RESULT_PAYLOAD)},
              "radius": ${ScanMetrics.resultPayloadRadius.value}
            },
            "result-actions": {
              "top": ${top(ScanMetrics.RESULT_ACTIONS)},
              "height": ${height(ScanMetrics.RESULT_ACTIONS)},
              "columnGap": 8
            },
            "result-copy": {
              "width": ${width(ScanMetrics.RESULT_COPY)},
              "height": ${height(ScanMetrics.RESULT_COPY)},
              "fontSize": ${ScanMetrics.buttonTextSize}
            },
            "result-rescan": {
              "width": ${width(ScanMetrics.RESULT_RESCAN)},
              "height": ${height(ScanMetrics.RESULT_RESCAN)},
              "fontSize": ${ScanMetrics.buttonTextSize}
            }
            """
        record("scan", "result", ScanMetrics.RESULT_CARD, elements)
    }
}
