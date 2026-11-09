package com.royaraqamia.app.shell

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.royaraqamia.app.theme.LocalRoySpacing
import com.royaraqamia.app.ui.vectors.LucideVectors

/** The test handle for a row, so a check can find one without its label. */
fun servicesRowTestTag(entry: ServicesEntry): String = "shell-service-${entry.route.trimStart('/')}"

/** One row's height. */
internal val SERVICES_ROW_HEIGHT: Dp = 44.dp

/**
 * The `تطبيقاتنا` menu: its trigger and the eleven app rows behind it (#647).
 *
 * The rows are the site's (`frontend/ui/navbar/services-link.ts`), in the site's
 * order and with the site's words — `shared/copy/shell-services.json`, generated
 * into [ServicesCopy] — and the glyphs are the site's own `lucide-react` imports
 * through [LucideVectors] (ADR-0098, ADR-0100).
 *
 * [Trigger] is a state here because it is one of the menu's words: the checker
 * pairs each with the string the site draws, so the pill and the sheet cannot
 * disagree about what the menu is called.
 */
sealed interface ServicesEntry {
    val route: String

    /** The `تطبيقاتنا` pill in the top bar; the menu itself, not a destination. */
    data object Trigger : ServicesEntry {
        override val route: String = "#apps"
    }

    data object News : ServicesEntry {
        override val route: String = "/news"
    }

    data object Verify : ServicesEntry {
        override val route: String = "/verify"
    }

    data object Rates : ServicesEntry {
        override val route: String = "/rates"
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
        /**
         * The rows the sheet lists, in the site's order. `/verify` and
         * `/mcp/guide` left the picker (ADR-0152): their entries and copy stay
         * declared for the screens that still draw them, but the sheet does not
         * offer them.
         */
        val rows: List<ServicesEntry> =
            listOf(
                News,
                Rates,
                Scan,
                Quran,
                Athkar,
                LinkSnap,
                HabitFlow,
                SpendTrack,
                Notes,
            )
    }
}

/**
 * The site's `text-sm font-medium` for the pill (#902): the size is the theme's
 * label step, the weight is the page's.
 */
internal val ServicesLabelWeight = FontWeight.Medium

/**
 * The pill in the top bar. Pressing it opens [ServicesSheet].
 *
 * It draws what the site's trigger draws, to the page's own numbers (#902): the
 * glyph, the word, and the chevron the site's `NavDropdown` carries. The
 * chevron used to be left out on the reasoning that a sheet is the affordance a
 * chevron stands in for - but the site's trigger opens the same sheet and still
 * draws it, so the difference was the app's, not a decision.
 */
@Composable
fun ServicesTrigger(onOpen: () -> Unit, modifier: Modifier = Modifier) {
    Row(
        modifier =
            modifier.clip(RoundedCornerShape(percent = 50))
                .clickable(onClick = onOpen)
                .semantics { role = Role.Button }
                // The site's `min-h-10 px-3.5 py-2`, read rather than guessed.
                .heightIn(min = 40.dp)
                .padding(horizontal = 14.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Icon(
            imageVector = LucideVectors.Plug,
            contentDescription = null,
            tint = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.size(16.dp),
        )
        Text(
            text = ServicesCopy.TRIGGER,
            style = MaterialTheme.typography.labelLarge.copy(fontWeight = ServicesLabelWeight),
            color = MaterialTheme.colorScheme.onSurface,
            maxLines = 1,
        )
        Icon(
            imageVector = LucideVectors.ChevronDown,
            contentDescription = null,
            tint = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.size(14.dp),
        )
    }
}

/**
 * The rows, as a sheet, in the site's order (#647).
 *
 * A row leaves the sheet and then opens its route: the sheet owns the dismissal,
 * the caller owns where the row goes.
 *
 * The surface is the shell's own rather than Material3's `ModalBottomSheet`, so
 * scrim tap and back dismiss it and every pointer on the surface belongs to a
 * row. The drag this sheet used to carry is gone with the site's order
 * preference (ADR-0146): the homepage strip is the order now.
 */
@Composable
fun ServicesSheet(
    open: Boolean,
    onDismiss: () -> Unit,
    onSelect: (String) -> Unit,
) {
    if (!open) return
    val spacing = LocalRoySpacing.current

    // A sheet is a screen while it is open: back closes it rather than walking the
    // route underneath (ADR-0082).
    BackHandler(enabled = true, onBack = onDismiss)

    Box(Modifier.fillMaxSize()) {
        // `bg-black/70`, the scrim the site's sheets and the shell's dialogs use.
        Box(
            Modifier.fillMaxSize()
                .background(Color.Black.copy(alpha = 0.7f))
                .pointerInput(Unit) { detectTapGestures { onDismiss() } }
        )
        Surface(
            modifier = Modifier.align(Alignment.BottomCenter).fillMaxWidth(),
            shape = RoundedCornerShape(topStart = 16.dp, topEnd = 16.dp),
            color = MaterialTheme.colorScheme.surface,
        ) {
            Column(
                Modifier.fillMaxWidth().navigationBarsPadding()
                    .padding(bottom = spacing.elementGapSm)
            ) {
                Box(Modifier.fillMaxWidth().padding(top = 8.dp), contentAlignment = Alignment.Center) {
                    Box(
                        Modifier.width(32.dp)
                            .height(4.dp)
                            .clip(RoundedCornerShape(percent = 50))
                            .background(
                                MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.4f)
                            )
                    )
                }
                Text(
                    text = ServicesCopy.TRIGGER,
                    style = MaterialTheme.typography.titleMedium,
                    color = MaterialTheme.colorScheme.onSurface,
                    modifier =
                        Modifier.padding(horizontal = spacing.containerPadding, vertical = 12.dp),
                )
                ServicesEntry.rows.forEach { entry ->
                    Row(
                        modifier =
                            Modifier.fillMaxWidth()
                                .height(SERVICES_ROW_HEIGHT)
                                .testTag(servicesRowTestTag(entry))
                                .clickable { onSelect(entry.route) }
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
            }
        }
    }
}

/** The site's word for a row, from the one copy source both clients read. */
internal fun labelOf(entry: ServicesEntry): String =
    when (entry) {
        ServicesEntry.Trigger -> ServicesCopy.TRIGGER
        ServicesEntry.News -> ServicesCopy.NEWS
        ServicesEntry.Verify -> ServicesCopy.VERIFY
        ServicesEntry.Rates -> ServicesCopy.RATES
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
internal fun iconOf(entry: ServicesEntry): ImageVector =
    when (entry) {
        ServicesEntry.Trigger -> LucideVectors.Plug
        ServicesEntry.News -> LucideVectors.Newspaper
        ServicesEntry.Verify -> LucideVectors.ScanLine
        ServicesEntry.Rates -> LucideVectors.Coins
        ServicesEntry.Scan -> LucideVectors.ScanBarcode
        ServicesEntry.Quran -> LucideVectors.BookOpen
        ServicesEntry.Athkar -> LucideVectors.SunMoon
        ServicesEntry.LinkSnap -> LucideVectors.Link2
        ServicesEntry.HabitFlow -> LucideVectors.SquareCheck
        ServicesEntry.SpendTrack -> LucideVectors.Wallet
        ServicesEntry.Notes -> LucideVectors.StickyNote
        ServicesEntry.McpGuide -> LucideVectors.Plug
    }
