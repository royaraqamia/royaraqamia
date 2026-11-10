package com.royaraqamia.app.spendtrack

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.test.getUnclippedBoundsInRoot
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithTag
import androidx.compose.ui.test.onFirst
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import com.github.takahirom.roborazzi.captureRoboImage
import com.royaraqamia.app.store.spendtrack.SpendtrackCategoryRow
import com.royaraqamia.app.theme.RoyColors
import com.royaraqamia.app.theme.RoyaraqamiaTheme
import java.io.File
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/**
 * The app's half of the visual gate for `/spendtrack/categories` (#959,
 * ADR-0118).
 *
 * It draws the categories page's own components - the title row with the create
 * control, and the list with its rows - at 393 x 852 CSS px, Arabic, RTL and
 * dark, writes every contract element's numbers to
 * `e2e/__visual__/spendtrack-categories/at-rest/app.json` and the first row's
 * pixels to `app.png`. `check:visual` compares them with the page's recording.
 *
 * The rows are the fixture the page's recording seeds: the shared default
 * `أخرى` first (it sorts first by name and is why the web row has no actions),
 * then the account's `طعام` and `مواصلات`. The widths are the page's own: the
 * page's 16dp gutters and the card's 20dp padding take the row to 319dp, which
 * the composition reproduces rather than duplicates.
 */
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(
    sdk = [34],
    qualifiers = "ar-rSA-ldrtl-w393dp-h852dp-440dpi",
    application = android.app.Application::class
)
class SpendtrackCategoriesScreenVisualTest {
    @get:Rule val compose = createComposeRule()

    private val other =
        SpendtrackCategoryRow(
            id = "2335a897-cb50-4b3f-b3a4-6a6e06aeaf84",
            userId = null,
            name = "أخرى",
            colorHex = "#AEB6BF",
            createdAt = "2026-07-18T10:54:49.271962Z",
            clientId = null,
            updatedAt = null,
            deletedAt = null,
        )
    private val food =
        SpendtrackCategoryRow(
            id = "e2e00000-0000-4000-8000-000000000001",
            userId = "e2e-visual",
            name = "طعام",
            colorHex = "#f97316",
            createdAt = "2026-11-10T00:00:00.000Z",
            clientId = null,
            updatedAt = null,
            deletedAt = null,
        )
    private val transport =
        SpendtrackCategoryRow(
            id = "e2e00000-0000-4000-8000-000000000002",
            userId = "e2e-visual",
            name = "مواصلات",
            colorHex = "#3b82f6",
            createdAt = "2026-11-10T00:00:00.000Z",
            clientId = null,
            updatedAt = null,
            deletedAt = null,
        )

    private fun width(tag: String): Float {
        val box = compose.onAllNodesWithTag(tag).onFirst().getUnclippedBoundsInRoot()
        return (box.right - box.left).value
    }

    private fun height(tag: String): Float {
        val box = compose.onAllNodesWithTag(tag).onFirst().getUnclippedBoundsInRoot()
        return (box.bottom - box.top).value
    }

    private fun compose() {
        val rows = listOf(other, food, transport)
        compose.setContent {
            RoyaraqamiaTheme {
                CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Rtl) {
                    Box(Modifier.width(393.dp).fillMaxHeight().background(RoyColors.background)) {
                        Column(
                            modifier = Modifier.padding(horizontal = 16.dp),
                            verticalArrangement = Arrangement.spacedBy(24.dp),
                        ) {
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                Text(
                                    text = "التَّصنيفات",
                                    style = MaterialTheme.typography.headlineSmall,
                                    color = MaterialTheme.colorScheme.onSurface,
                                )
                                SpendtrackAddCategoryButton(onClick = {})
                            }
                            // The page's rows sit inside a card (`bg-card/95`);
                            // a semi-transparent row over the page background
                            // would composite to a lighter grey than the site's.
                            Box(
                                Modifier.padding(horizontal = 21.dp)
                                    .background(RoyColors.card.copy(alpha = 0.95f))
                            ) {
                                SpendtrackCategoryList(
                                    state = SpendtrackCategoriesUiState.of(rows),
                                    onEdit = {},
                                    onDelete = {},
                                    modifier = Modifier.height(400.dp),
                                )
                            }
                        }
                    }
                }
            }
        }
    }

    private fun record() {
        val json =
            """
            {
              "surface": "spendtrack-categories",
              "elements": {
                "list": {
                  "width": ${width("spendtrack-categories-list")}
                },
                "row": {
                  "width": ${width("spendtrack-category-row")},
                  "height": ${height("spendtrack-category-row")},
                  "radius": 12
                },
                "create": {
                  "height": ${height("spendtrack-category-create")}
                }
              }
            }
            """.trimIndent()

        val dir = File("../../e2e/__visual__/spendtrack-categories/at-rest").apply { mkdirs() }
        File(dir, "app.json").writeText(json + "\n")
        compose
            .onAllNodesWithTag("spendtrack-category-row")
            .onFirst()
            .captureRoboImage(File(dir, "app.png").path)
    }

    @Test
    fun `the categories page records the page's boxes with three categories`() {
        compose()
        record()
    }
}
