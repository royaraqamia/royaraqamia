package com.royaraqamia.app.home

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.dp

/**
 * The door (#1399, ADR-0146): the member's apps as a strip, and the selected app
 * drawn under it, on the same page.
 *
 * A tab is a selection, not a navigation (ADR-0151): choosing one swaps the
 * surface beneath the strip and never pushes a route, so back leaves the door
 * the way a page does. The empty state is the first-run state of the same
 * surface, not a placeholder, and it opens the same picker that adds the tenth
 * app — there is no second onboarding flow.
 *
 * The surface is a slot rather than a `when` here: every app is a product screen
 * with its own repositories, and the shell is where the graph is wired. This
 * composable owns the door (strip, empty state, skeleton, arrange mode) and
 * nothing about which app the graph hands it.
 *
 * `key(selected)` is what makes a tab change a new screen: without it a reader
 * deep in one app's scroll would land halfway down the next one, and the page's
 * own selection scrolls the surface to its top.
 */
@Composable
fun HomeScreen(
    order: List<String>,
    status: HomeServicesStatus,
    selected: String?,
    onSelect: (String) -> Unit,
    onAddApp: () -> Unit,
    onReorder: (List<String>) -> Unit,
    surface: @Composable (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    var arranging by remember { mutableStateOf(false) }

    // Choosing a tab leaves arrange mode, exactly as the page's strip does.
    LaunchedEffect(selected) { arranging = false }

    Column(modifier = modifier.fillMaxSize()) {
        when {
            selected != null -> {
                HomeTabStrip(
                    order = order,
                    selected = selected,
                    onSelect = onSelect,
                    arranging = arranging,
                    onToggleArrange = { arranging = !arranging },
                    onReorder = onReorder,
                )
                Box(Modifier.weight(1f).fillMaxWidth().testTag("home-app-surface")) {
                    // A new tab is a new screen, not the previous one's state.
                    androidx.compose.runtime.key(selected) { surface(selected) }
                }
            }
            status == HomeServicesStatus.Loading -> HomeSkeleton()
            else -> HomeEmptyState(onAddApp = onAddApp)
        }
    }
}

/**
 * The first paint while the account's or the device's list is read (#1194).
 *
 * The page draws three pills so the strip does not jump when the rows land; the
 * skeleton is the strip's own shape and nothing else, which is why it is not a
 * spinner in the middle of an empty page.
 */
@Composable
private fun HomeSkeleton() {
    Row(
        modifier =
            Modifier.fillMaxWidth()
                .padding(
                    start = HomeStripMetrics.horizontalPadding,
                    end = HomeStripMetrics.horizontalPadding,
                    top = HomeStripMetrics.topPadding,
                )
                .padding(vertical = HomeStripMetrics.rowVerticalPadding),
        horizontalArrangement = Arrangement.spacedBy(HomeStripMetrics.gap),
    ) {
        repeat(3) {
            Box(
                Modifier.width(128.dp)
                    .height(HomeStripMetrics.pillMinHeight)
                    .clip(RoundedCornerShape(HomeStripMetrics.pillRadius))
                    .background(androidx.compose.material3.MaterialTheme.colorScheme.onSurface.copy(alpha = 0.08f))
            )
        }
    }
}
