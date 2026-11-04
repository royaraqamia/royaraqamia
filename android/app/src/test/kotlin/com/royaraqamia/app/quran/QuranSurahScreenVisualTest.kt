package com.royaraqamia.app.quran

import androidx.compose.foundation.background
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
import com.royaraqamia.app.theme.RoyColors
import com.royaraqamia.app.theme.RoyaraqamiaTheme
import java.io.File
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/**
 * The app's half of the visual gate for `/quran/108` (#955, ADR-0118).
 *
 * It draws the smallest complete sura at the viewport the page was recorded at -
 * 393 x 852 CSS px, Arabic, RTL, dark - writes every contract element's numbers
 * to `e2e/__visual__/quran-surah/at-rest/app.json` and the first Ayah card's own
 * pixels to `app.png`. The text is read from the same vendored assets the screen
 * reads, so the recording is of the real Uthmani copy and face.
 */
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(
    sdk = [34],
    qualifiers = "ar-rSA-ldrtl-w393dp-h852dp-440dpi",
    application = android.app.Application::class
)
class QuranSurahScreenVisualTest {
    @get:Rule val compose = createComposeRule()

    @Test
    fun `the screen records the same numbers as the page`() {
        val context = RuntimeEnvironment.getApplication()
        val repository = AssetQuranRepository(context, PreferencesQuranPositionStore(context))
        val index = repository.index()
        val surah = requireNotNull(repository.surah(108))
        val summary = requireNotNull(index.surahs.firstOrNull { it.n == 108 })
        val marks = repository.pages().marksForSurah(108)

        compose.setContent {
            RoyaraqamiaTheme {
                CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Rtl) {
                    Box(Modifier.width(393.dp).fillMaxHeight().background(RoyColors.background)) {
                        QuranSurahScreen(
                            surah = surah,
                            summary = summary,
                            marks = marks,
                            position = null,
                            onSavePosition = {},
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

        val json =
            """
            {
              "surface": "quran-surah",
              "elements": {
                "title": {
                  "top": ${top(QuranSurahMetrics.TITLE)},
                  "height": ${height(QuranSurahMetrics.TITLE)},
                  "fontSize": ${QuranSurahMetrics.titleSize.value},
                  "fontWeight": ${QuranSurahMetrics.titleWeight.weight}
                },
                "meta": {
                  "top": ${top(QuranSurahMetrics.META)},
                  "height": ${height(QuranSurahMetrics.META)},
                  "fontSize": ${QuranSurahMetrics.metaSize.value}
                },
                "first-card": {
                  "top": ${top(QuranSurahMetrics.cardTag(1))},
                  "width": ${width(QuranSurahMetrics.cardTag(1))},
                  "radius": ${QuranSurahMetrics.cardRadius.value},
                  "paddingTop": ${QuranSurahMetrics.cardPadding.value},
                  "paddingLeft": ${QuranSurahMetrics.cardPadding.value}
                },
                "first-ayah": {
                  "height": ${height(QuranSurahMetrics.ayahTag(1))},
                  "fontSize": ${QuranSurahMetrics.ayahSize.value},
                  "lineHeight": ${QuranSurahMetrics.ayahLineHeight.value}
                },
                "first-marker": {
                  "width": ${width(QuranSurahMetrics.markerTag(1))},
                  "height": ${height(QuranSurahMetrics.markerTag(1))}
                }
              }
            }
            """.trimIndent()

        val dir = File("../../e2e/__visual__/quran-surah/at-rest").apply { mkdirs() }
        File(dir, "app.json").writeText(json)
        compose
            .onNodeWithTag(QuranSurahMetrics.ayahTag(1), useUnmergedTree = true)
            .captureRoboImage(File(dir, "app.png").path)
    }
}
