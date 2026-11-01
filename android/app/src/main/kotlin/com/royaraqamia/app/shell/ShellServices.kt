package com.royaraqamia.app.shell

import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectDragGesturesAfterLongPress
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.zIndex
import com.royaraqamia.app.theme.LocalRoySpacing
import com.royaraqamia.app.ui.vectors.LucideVectors
import kotlin.math.roundToInt

/** The test handle for a row, so a check can find one without its label. */
fun servicesRowTestTag(entry: ServicesEntry): String = "shell-service-${entry.route.trimStart('/')}"

/** One row's height. Fixed, because the drag measures slots with it (#806). */
internal val SERVICES_ROW_HEIGHT: Dp = 44.dp

/**
 * How long a drop keeps the row from acting as a tap.
 *
 * The site needs the same guard for the same reason (`CLICK_SUPPRESS_MS`): the
 * pointer up that ends a drag is also a tap on a row that navigates, so a
 * reorder would leave the sheet by opening the row it was arranging.
 */
internal const val DRAG_CLICK_SUPPRESS_MS = 400L

/**
 * The `خدماتنا` menu: its trigger and the sixteen rows behind it (#647).
 *
 * The rows are the site's (`frontend/ui/navbar/services-link.ts`), in the order
 * this device keeps them (#806) and with the site's words — `shared/copy/shell-services.json`,
 * generated into [ServicesCopy] — and the glyphs are the site's own `lucide-react`
 * imports through [LucideVectors] (ADR-0098, ADR-0100). The one product the site
 * hides has no row on either side.
 *
 * [Trigger] is a state here because it is one of the menu's words: the checker
 * pairs each with the string the site draws, so the pill and the sheet cannot
 * disagree about what the menu is called.
 */
sealed interface ServicesEntry {
    val route: String

    /** The `خدماتنا` pill in the top bar; the menu itself, not a destination. */
    data object Trigger : ServicesEntry {
        override val route: String = "#services"
    }

    data object RequestProject : ServicesEntry {
        override val route: String = "/request-project"
    }

    data object Hire : ServicesEntry {
        override val route: String = "/hire"
    }

    data object News : ServicesEntry {
        override val route: String = "/news"
    }

    data object Training : ServicesEntry {
        override val route: String = "/training/apply"
    }

    data object Verify : ServicesEntry {
        override val route: String = "/verify"
    }

    data object Consultation : ServicesEntry {
        override val route: String = "/consultation/book"
    }

    data object Rates : ServicesEntry {
        override val route: String = "/rates"
    }

    data object Downloader : ServicesEntry {
        override val route: String = "/downloader"
    }

    data object Scan : ServicesEntry {
        override val route: String = "/scan"
    }

    data object Quran : ServicesEntry {
        override val route: String = "/quran"
    }

    data object Athkar : ServicesEntry {
        override val route: String = "/athkar"
    }

    data object LinkSnap : ServicesEntry {
        override val route: String = "/linksnap"
    }

    data object HabitFlow : ServicesEntry {
        override val route: String = "/habitflow"
    }

    data object SpendTrack : ServicesEntry {
        override val route: String = "/spendtrack"
    }

    data object Notes : ServicesEntry {
        override val route: String = "/notes"
    }

    data object McpGuide : ServicesEntry {
        override val route: String = "/mcp/guide"
    }

    companion object {
        /** The rows the sheet lists, in the site's order. */
        val rows: List<ServicesEntry> =
            listOf(
                RequestProject,
                Hire,
                News,
                Training,
                Verify,
                Consultation,
                Rates,
                Downloader,
                Scan,
                Quran,
                Athkar,
                LinkSnap,
                HabitFlow,
                SpendTrack,
                Notes,
                McpGuide,
            )

        /**
         * The rows a member still sees (ADR-0112).
         *
         * Filtering, not a state: the catalog stays the sixteen rows the parity
         * row pairs with the site, and what a member hid is a fact about the
         * account rather than a variant of the menu. A route the account holds
         * that the catalog no longer has matches nothing here, which is the right
         * answer — there is no row to hide.
         */
        fun visibleRows(hidden: Set<String>): List<ServicesEntry> =
            rows.filterNot { it.route in hidden }
    }
}

/**
 * The pill in the top bar. Pressing it opens [ServicesSheet].
 *
 * The site's trigger carries a chevron as well, drawn by `NavDropdown`; the app's
 * opens a full sheet, which is the affordance a chevron stands in for on a page
 * that cannot slide, so the pill is the mark and the word.
 */
@Composable
fun ServicesTrigger(onOpen: () -> Unit, modifier: Modifier = Modifier) {
    val spacing = LocalRoySpacing.current
    Row(
        modifier =
            modifier.clip(RoundedCornerShape(percent = 50))
                .clickable(onClick = onOpen)
                .semantics { role = Role.Button }
                .padding(horizontal = spacing.elementGapSm, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Icon(
            imageVector = LucideVectors.Package,
            contentDescription = null,
            tint = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.size(16.dp),
        )
        Text(
            text = ServicesCopy.TRIGGER,
            style = MaterialTheme.typography.labelLarge.copy(fontWeight = FontWeight.Medium),
            color = MaterialTheme.colorScheme.onSurface,
            maxLines = 1,
        )
    }
}

/**
 * The rows, as a bottom sheet, in the order this device keeps them (#806).
 *
 * A row leaves the sheet and then opens its route: the sheet owns the dismissal,
 * the caller owns where the row goes, which is how the site's own sheet behaves
 * (`ServicesMenuItems` dismisses, then navigates).
 *
 * Holding a row and dragging it reorders the list, which is the site's touch
 * gesture on its own grip. The order is the device's ([ServicesOrderStore]), so
 * it is written once, on the drop — a drag that is cancelled leaves the stored
 * order alone. The sentence the site keeps in a visually hidden live region is
 * drawn here instead: on a phone it is also the only confirmation the drag did
 * anything, and the words are the same generated ones ([ServicesOrderCopy]).
 *
 * Rows are a fixed height so a slot is arithmetic rather than a layout query,
 * which is what keeps the reorder testable in [ServicesOrderRules].
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ServicesSheet(
    open: Boolean,
    onDismiss: () -> Unit,
    onSelect: (String) -> Unit,
    hiddenRoutes: Set<String> = emptySet(),
    order: ServicesOrderStore? = null,
) {
    if (!open) return
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    val spacing = LocalRoySpacing.current

    val visible = remember(hiddenRoutes) { ServicesEntry.visibleRows(hiddenRoutes) }
    val defaults = remember(visible) { visible.map { it.route } }
    var routes by remember(defaults) {
        mutableStateOf(ServicesOrderRules.resolve(defaults, order?.read()))
    }
    val byRoute = remember(visible) { visible.associateBy { it.route } }

    val rowHeightPx = with(LocalDensity.current) { SERVICES_ROW_HEIGHT.toPx() }
    var draggingRoute by remember { mutableStateOf<String?>(null) }
    var dragOffset by remember { mutableStateOf(0f) }
    var announcement by remember { mutableStateOf("") }
    var lastDropAt by remember { mutableStateOf(0L) }

    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = sheetState) {
        Column(Modifier.fillMaxWidth().navigationBarsPadding().padding(bottom = spacing.elementGapSm)) {
            Text(
                text = ServicesCopy.TRIGGER,
                style = MaterialTheme.typography.titleMedium,
                color = MaterialTheme.colorScheme.onSurface,
                modifier = Modifier.padding(horizontal = spacing.containerPadding, vertical = 12.dp),
            )
            routes.mapNotNull { byRoute[it] }.forEach { entry ->
                val dragging = draggingRoute == entry.route
                Row(
                    modifier =
                        Modifier.fillMaxWidth()
                            .height(SERVICES_ROW_HEIGHT)
                            .zIndex(if (dragging) 1f else 0f)
                            .graphicsLayer { translationY = if (dragging) dragOffset else 0f }
                            .testTag(servicesRowTestTag(entry))
                            .pointerInput(entry.route) {
                                detectDragGesturesAfterLongPress(
                                    onDragStart = {
                                        draggingRoute = entry.route
                                        dragOffset = 0f
                                        announcement = ""
                                    },
                                    onDrag = { change, amount ->
                                        change.consume()
                                        dragOffset += amount.y
                                        val from = routes.indexOf(entry.route)
                                        if (from != -1) {
                                            val target =
                                                (from + (dragOffset / rowHeightPx).roundToInt())
                                                    .coerceIn(0, routes.lastIndex)
                                            if (target != from) {
                                                routes = ServicesOrderRules.move(routes, from, target)
                                                dragOffset -= (target - from) * rowHeightPx
                                            }
                                        }
                                    },
                                    onDragEnd = {
                                        val from = routes.indexOf(entry.route)
                                        draggingRoute = null
                                        dragOffset = 0f
                                        lastDropAt = System.currentTimeMillis()
                                        order?.save(routes)
                                        if (from != -1) {
                                            announcement =
                                                servicesOrderAnnouncement(labelOf(entry), from + 1, routes.size)
                                        }
                                    },
                                    onDragCancel = {
                                        draggingRoute = null
                                        dragOffset = 0f
                                    },
                                )
                            }
                            .clickable {
                                val since = System.currentTimeMillis() - lastDropAt
                                if (since > DRAG_CLICK_SUPPRESS_MS) onSelect(entry.route)
                            }
                            .semantics { role = Role.Button }
                            .padding(horizontal = spacing.containerPadding),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    Icon(
                        imageVector = iconOf(entry),
                        contentDescription = null,
                        tint = MaterialTheme.colorScheme.primary,
                        modifier = Modifier.size(16.dp),
                    )
                    Text(
                        text = labelOf(entry),
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurface,
                        maxLines = 1,
                    )
                }
            }
            if (announcement.isNotEmpty()) {
                Text(
                    text = announcement,
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier =
                        Modifier.padding(horizontal = spacing.containerPadding, vertical = 8.dp)
                            .semantics { liveRegion = LiveRegionMode.Polite },
                )
            }
        }
    }
}

/**
 * The sentence a row's move is announced with, from the one copy source both
 * clients read (#806). The words are the site's; only the substitution is here.
 */
internal fun servicesOrderAnnouncement(label: String, position: Int, total: Int): String =
    ServicesOrderCopy.MOVED
        .replace("{label}", label)
        .replace("{position}", position.toString())
        .replace("{total}", total.toString())

/** The site's word for a row, from the one copy source both clients read. */
internal fun labelOf(entry: ServicesEntry): String =
    when (entry) {
        ServicesEntry.Trigger -> ServicesCopy.TRIGGER
        ServicesEntry.RequestProject -> ServicesCopy.REQUEST_PROJECT
        ServicesEntry.Hire -> ServicesCopy.HIRE
        ServicesEntry.News -> ServicesCopy.NEWS
        ServicesEntry.Training -> ServicesCopy.TRAINING
        ServicesEntry.Verify -> ServicesCopy.VERIFY
        ServicesEntry.Consultation -> ServicesCopy.CONSULTATION
        ServicesEntry.Rates -> ServicesCopy.RATES
        ServicesEntry.Downloader -> ServicesCopy.DOWNLOADER
        ServicesEntry.Scan -> ServicesCopy.SCAN
        ServicesEntry.Quran -> ServicesCopy.QURAN
        ServicesEntry.Athkar -> ServicesCopy.ATHKAR
        ServicesEntry.LinkSnap -> ServicesCopy.LINK_SNAP
        ServicesEntry.HabitFlow -> ServicesCopy.HABIT_FLOW
        ServicesEntry.SpendTrack -> ServicesCopy.SPEND_TRACK
        ServicesEntry.Notes -> ServicesCopy.NOTES
        ServicesEntry.McpGuide -> ServicesCopy.MCP_GUIDE
    }

/** The site's own glyph for a row, from its `lucide-react` imports. */
private fun iconOf(entry: ServicesEntry): ImageVector =
    when (entry) {
        ServicesEntry.Trigger -> LucideVectors.Package
        ServicesEntry.RequestProject -> LucideVectors.Rocket
        ServicesEntry.Hire -> LucideVectors.CalendarClock
        ServicesEntry.News -> LucideVectors.Newspaper
        ServicesEntry.Training -> LucideVectors.GraduationCap
        ServicesEntry.Verify -> LucideVectors.ScanLine
        ServicesEntry.Consultation -> LucideVectors.CalendarCheck
        ServicesEntry.Rates -> LucideVectors.Coins
        ServicesEntry.Downloader -> LucideVectors.Download
        ServicesEntry.Scan -> LucideVectors.ScanBarcode
        ServicesEntry.Quran -> LucideVectors.BookOpen
        ServicesEntry.Athkar -> LucideVectors.SunMoon
        ServicesEntry.LinkSnap -> LucideVectors.Link2
        ServicesEntry.HabitFlow -> LucideVectors.SquareCheck
        ServicesEntry.SpendTrack -> LucideVectors.Wallet
        ServicesEntry.Notes -> LucideVectors.StickyNote
        ServicesEntry.McpGuide -> LucideVectors.Plug
    }
