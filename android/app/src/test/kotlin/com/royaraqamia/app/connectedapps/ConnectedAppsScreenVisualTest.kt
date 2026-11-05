package com.royaraqamia.app.connectedapps

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
import com.royaraqamia.app.api.ApiClient
import com.royaraqamia.app.net.HttpResponse
import com.royaraqamia.app.session.MemoryTokenStore
import com.royaraqamia.app.session.RefreshOutcome
import com.royaraqamia.app.session.Session
import com.royaraqamia.app.session.TokenPair
import com.royaraqamia.app.session.TokenRefresher
import com.royaraqamia.app.store.MemoryIdentityStorage
import com.royaraqamia.app.support.RecordingTransport
import com.royaraqamia.app.theme.Recipes
import com.royaraqamia.app.theme.RoyaraqamiaTheme
import com.royaraqamia.app.theme.royTypeScale
import java.io.File
import kotlinx.coroutines.runBlocking
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/**
 * The app's half of the visual gate for `/account/connected-apps` (#900,
 * ADR-0118).
 *
 * It draws the screen at the viewport the page was recorded at - 393 x 852 CSS
 * px, Arabic, RTL, dark - writes every contract element's numbers to
 * `e2e/__visual__/account-connected-apps/at-rest/app.json` and the guest action's
 * own pixels to `app.png`, and `check:visual` compares them with the page's
 * recording. A number that differs is a failure that names the element and both
 * values.
 *
 * The state is the page at rest for a guest: no session, so the one sign-in
 * action is what both clients draw. `signedIn = false` is also what keeps the
 * repository unread - the screen never asks it anything, so the transport in it
 * is the test's own and never called.
 *
 * The boxes are measured; the type sizes and weights the contract names are read
 * from [ConnectedAppsScreenMetrics], the object the screen draws with, because
 * Compose does not expose resolved typography through the semantics tree. The
 * raster is what proves the type actually landed as declared.
 *
 * The screen is composed inside a 393dp-wide box because the window is 1080 px at
 * DPR 2.75, which is 392.7dp: the page is 393 CSS px and the boxes have to be
 * measured in the same units.
 */
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(
    sdk = [34],
    qualifiers = "ar-rSA-ldrtl-w393dp-h852dp-440dpi",
    application = android.app.Application::class
)
class ConnectedAppsScreenVisualTest {
    @get:Rule val compose = createComposeRule()

    private fun repository(): ConnectedAppsRepository {
        val session =
            runBlocking {
                Session(
                        MemoryTokenStore("refresh-1"),
                        TokenRefresher { RefreshOutcome.Refused },
                        MemoryIdentityStorage(),
                    )
                    .also { it.signIn(TokenPair("access-1", "refresh-1", "user-1")) }
            }
        return ConnectedAppsRepository(
            ApiClient("https://app.test", session, RecordingTransport { HttpResponse(500, "{}") })
        )
    }

    @Test
    fun `the screen records the same numbers as the page`() {
        compose.setContent {
            RoyaraqamiaTheme {
                CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Rtl) {
                    Box(Modifier.width(393.dp).fillMaxHeight()) {
                        ConnectedAppsScreen(
                            repository = repository(),
                            signedIn = false,
                            onSignIn = {},
                            onConnectNew = {},
                        )
                    }
                }
            }
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

        // The action's type comes from the recipe the card draws with, so a
        // changed `Recipes.Cta.text` changes the recording.
        val ctaText = Recipes.Cta.text(royTypeScale(393f))
        // Both clients draw a pill; the page states it as `border-radius: 9999px`
        // and Compose as 50% of the box, so the semantic value is the page's.
        val pillRadius = 9999

        val json =
            """
            {
              "surface": "account-connected-apps",
              "elements": {
                "title": {
                  "top": ${top(ConnectedAppsScreenMetrics.TITLE)},
                  "height": ${height(ConnectedAppsScreenMetrics.TITLE)},
                  "fontSize": ${ConnectedAppsScreenMetrics.titleSize.value},
                  "fontWeight": ${ConnectedAppsScreenMetrics.titleWeight.weight}
                },
                "cta": {
                  "top": ${top(ConnectedAppsScreenMetrics.CTA)},
                  "width": ${width(ConnectedAppsScreenMetrics.CTA)},
                  "height": ${height(ConnectedAppsScreenMetrics.CTA)},
                  "radius": $pillRadius,
                  "fontSize": ${ctaText.fontSize.value},
                  "fontWeight": ${ctaText.fontWeight?.weight ?: 700}
                }
              }
            }
            """.trimIndent()

        val dir = File("../../e2e/__visual__/account-connected-apps/at-rest").apply { mkdirs() }
        File(dir, "app.json").writeText("$json\n")
        // The capture is Roborazzi's: it is what settles the frame clock under
        // Robolectric (see CaptureSmokeTest). It writes only in record mode, so
        // the evidence is produced by `-Proborazzi.record=true`.
        compose.onNodeWithTag(ConnectedAppsScreenMetrics.CTA, useUnmergedTree = true)
            .captureRoboImage(File(dir, "app.png").path)
    }
}
