package com.royaraqamia.app.shell

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.WindowInsetsSides
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.only
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.dp
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
    const val BACK = "shell-back"
    const val CONTENT = "shell-content"
}

/** The band `SecondaryHeader.tsx` reserves: `3.5rem` on a phone. */
private val SecondaryBandHeight = 56.dp

/** The site's `max-sm:inset-s-3 max-sm:top-3`: twelve pixels in the corner. */
private val BackControlInset = 12.dp

/**
 * The frame the app draws before it is anything else (#647, #967).
 *
 * A surface and then one of the page's two chromes, chosen by the route the way
 * `frontend/ui/navbar/route-kind.ts` chooses it:
 *
 * - A primary route keeps the top bar and the tab bar, as before.
 * - A secondary route draws no bar and no title: it reserves the band
 *   `SecondaryHeader` reserves and floats the page's back control in the
 *   inline-start corner of that band, so a page that dropped its chrome on the
 *   site drops the same chrome in the app.
 *
 * It is drawn from the tokens (`RoyaraqamiaTheme` is installed by [ShellActivity])
 * and it is RTL before it is laid out, so the first frame is the product's rather
 * than the platform's.
 *
 * While a destination's screen is still the document ([NativeSurfaces]), the
 * content area is empty and the shell hands the route over: the frame is what the
 * splash lifts into, and what the user comes back to when the document closes.
 * Each ported surface fills the content area and its row in
 * `docs/mobile/screens.json` changes in the same pull request.
 *
 * The services sheet is opened from the frame and is the app picker (#1194,
 * ADR-0146): its rows add and remove homepage apps, so it never outlives a
 * navigation and the list it edits is the caller's. A secondary route has no
 * trigger, so it has no sheet.
 */
@Composable
fun ShellFrame(
    currentRoute: String,
    onSelect: (ShellTab) -> Unit,
    onOpenRoute: (String) -> Unit,
    modifier: Modifier = Modifier,
    /** The bell's unread count, or null while there is no session to ask (#659). */
    unreadCount: Int? = null,
    /** Whether the assistant's door is drawn over the content (ADR-0143). */
    showAssistant: Boolean = true,
    /** Where the door opens: the sheet, or the sign-in flow for a guest. */
    onOpenAssistant: () -> Unit = {},
    /** The apps on the homepage, in tab order (#1194). */
    homeOrder: List<String> = emptyList(),
    /** The picker row whose write is in flight, or null. */
    homeBusy: String? = null,
    /** The picker's refused-write line, or null. */
    homeError: String? = null,
    /** Adds or removes a homepage app; the picker never navigates. */
    onToggleHomeService: (String) -> Unit = {},
    /** What the secondary frame's floating control does; the page's own back. */
    onBack: () -> Unit = {},
    content: @Composable BoxScope.() -> Unit = {},
) {
    var servicesOpen by remember { mutableStateOf(false) }
    val spacing = LocalRoySpacing.current
    val primary = Routes.isPrimary(currentRoute)

    Surface(modifier = modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
        if (primary) {
            Column(Modifier.fillMaxSize()) {
                ShellTopBar(
                    onOpenServices = { servicesOpen = true },
                    showServices = ServicesEntry.rows.isNotEmpty(),
                    unreadCount = unreadCount,
                    onOpenNotifications = { onOpenRoute(Routes.NOTIFICATIONS_ROUTE) },
                )
                // The door floats over the destination, not over the tab bar: the
                // content area ends where the bar begins, so the corner is clear at
                // every height without a second measurement (ADR-0143).
                Box(Modifier.weight(1f).fillMaxWidth()) {
                    content()
                    AssistantDoor(
                        show = showAssistant,
                        onOpenAssistant = onOpenAssistant,
                        modifier = Modifier.padding(spacing.containerPadding),
                    )
                }
                ShellTabBar(currentRoute = currentRoute, onSelect = onSelect)
            }
            ServicesSheet(
                open = servicesOpen,
                order = homeOrder,
                busy = homeBusy,
                error = homeError,
                onToggle = onToggleHomeService,
                onDismiss = { servicesOpen = false },
                // The marketplace is a destination, not a homepage app (#1224).
                onOpenMarketplace = {
                    servicesOpen = false
                    onOpenRoute("/mcp/apps")
                },
            )
        } else {
            Box(Modifier.fillMaxSize()) {
                Column(
                    Modifier.fillMaxSize()
                        .windowInsetsPadding(
                            WindowInsets.statusBars.only(WindowInsetsSides.Top)
                        )
                ) {
                    // The page reserves `3.5rem + safe-top` above `#main-content`
                    // for the control (`app/global.css`); the frame reserves the
                    // same band so a native screen starts where the page starts.
                    Spacer(Modifier.height(SecondaryBandHeight).fillMaxWidth())
                    Box(Modifier.weight(1f).fillMaxWidth().testTag(ChromeTags.CONTENT)) {
                        content()
                        AssistantDoor(
                            show = showAssistant,
                            onOpenAssistant = onOpenAssistant,
                            modifier = Modifier.padding(spacing.containerPadding),
                        )
                    }
                }
                // `SecondaryHeader`'s own corner and safe-area offset: the control
                // floats over the band instead of taking a row of its own.
                Box(
                    Modifier.align(Alignment.TopStart)
                        .statusBarsPadding()
                        .padding(start = BackControlInset, top = BackControlInset)
                ) {
                    ShellBackControl(
                        onClick = onBack,
                        modifier = Modifier.testTag(ChromeTags.BACK),
                    )
                }
            }
        }
    }
}

/** The assistant's door, floating over whichever chrome the route wears (#967). */
@Composable
private fun BoxScope.AssistantDoor(
    show: Boolean,
    onOpenAssistant: () -> Unit,
    modifier: Modifier,
) {
    if (!show) return
    AssistantFab(
        onClick = onOpenAssistant,
        modifier = Modifier.align(Alignment.BottomStart).then(modifier),
    )
}
