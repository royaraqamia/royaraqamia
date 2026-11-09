package com.royaraqamia.app.shell

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import com.royaraqamia.app.assistant.AssistantFab
import com.royaraqamia.app.theme.LocalRoySpacing

/**
 * The visual gate's handles on the frame (#902, `shared/visual/chrome.json`).
 *
 * The tags are what the gate measures each box by, and they sit on the box the
 * contract names rather than on a copy the test draws: what is measured is what
 * the app ships. The bar's type sizes and weights are read from the objects the
 * bars draw with, because Compose does not expose resolved typography through
 * the semantics tree.
 */
object ChromeTags {
    const val TOP_BAR = "shell-top-bar"
    const val MARK = "shell-top-bar-mark"
    const val SERVICES = "shell-top-bar-services"
    const val BELL = "shell-top-bar-bell"
    const val TAB_BAR = "shell-tab-bar"
}

/**
 * The frame the app draws before it is anything else (#647).
 *
 * A surface, the top bar, the destination's content, and the tab bar. It is drawn
 * from the tokens (`RoyaraqamiaTheme` is installed by [ShellActivity]) and it is
 * RTL before it is laid out, so the first frame is the product's rather than the
 * platform's.
 *
 * While a destination's screen is still the document ([NativeSurfaces]), the
 * content area is empty and the shell hands the route over: the frame is what the
 * splash lifts into, and what the user comes back to when the document closes.
 * Each ported surface fills the content area and its row in
 * `docs/mobile/screens.json` changes in the same pull request.
 *
 * The services sheet is opened from the frame and closes itself before it
 * navigates, so the sheet never outlives the route it chose.
 */
@Composable
fun ShellFrame(
    currentRoute: String,
    onSelect: (ShellTab) -> Unit,
    onOpenRoute: (String) -> Unit,
    modifier: Modifier = Modifier,
    /** The routes this member hid; the sheet draws the rest (ADR-0112). */
    hiddenRoutes: Set<String> = emptySet(),
    /** Where the sheet keeps this device's order (#806). */
    servicesOrder: ServicesOrderStore? = null,
    /** The bell's unread count, or null while there is no session to ask (#659). */
    unreadCount: Int? = null,
    /** Whether the assistant's door is drawn over the content (ADR-0143). */
    showAssistant: Boolean = true,
    /** Where the door opens: the sheet, or the sign-in flow for a guest. */
    onOpenAssistant: () -> Unit = {},
    content: @Composable BoxScope.() -> Unit = {},
) {
    var servicesOpen by remember { mutableStateOf(false) }
    val spacing = LocalRoySpacing.current

    Surface(modifier = modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
        Column(Modifier.fillMaxSize()) {
            ShellTopBar(
                onOpenServices = { servicesOpen = true },
                showServices = ServicesEntry.visibleRows(hiddenRoutes).isNotEmpty(),
                unreadCount = unreadCount,
                onOpenNotifications = { onOpenRoute(Routes.NOTIFICATIONS_ROUTE) },
            )
            // The door floats over the destination, not over the tab bar: the
            // content area ends where the bar begins, so the corner is clear at
            // every height without a second measurement (ADR-0143).
            Box(Modifier.weight(1f).fillMaxWidth()) {
                content()
                if (showAssistant) {
                    AssistantFab(
                        onClick = onOpenAssistant,
                        modifier =
                            Modifier.align(Alignment.BottomStart)
                                .padding(spacing.containerPadding),
                    )
                }
            }
            ShellTabBar(currentRoute = currentRoute, onSelect = onSelect)
        }
        ServicesSheet(
            open = servicesOpen,
            hiddenRoutes = hiddenRoutes,
            order = servicesOrder,
            onDismiss = { servicesOpen = false },
            onSelect = { route ->
                servicesOpen = false
                onOpenRoute(route)
            },
        )
    }
}
