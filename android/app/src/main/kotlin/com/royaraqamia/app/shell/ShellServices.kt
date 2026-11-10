package com.royaraqamia.app.shell

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.royaraqamia.app.ui.vectors.LucideVectors

/**
 * The `تطبيقاتنا` menu: its trigger, and the nine apps the picker offers (#647).
 *
 * The rows are the site's (`frontend/ui/navbar/services-link.ts`), in the site's
 * order and with the site's words — `shared/copy/shell-services.json`, generated
 * into [ServicesCopy] — and the glyphs are the site's own `lucide-react` imports
 * through [LucideVectors] (ADR-0098, ADR-0100).
 *
 * A row is a catalogue entry rather than a destination since #1194: the sheet is
 * the picker (ADR-0146), so pressing a row's action adds or removes the app from
 * the homepage instead of opening it. `/verify` and `/mcp/guide` left the picker
 * (ADR-0152); their entries stay declared because the copy and the glyph are one
 * shared source, but the sheet does not offer them.
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

    /**
     * The marketplace (ADR-0155, phase 3 / #1224): not one of our apps, so it
     * is not in [rows] and can never be added to the homepage. It is drawn under
     * the nine, behind a divider and a section label, and it navigates.
     */
    data object Marketplace : ServicesEntry {
        override val route: String = "/mcp/apps"
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
            modifier
                .clip(RoundedCornerShape(percent = 50))
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
        ServicesEntry.Marketplace -> ServicesCopy.MARKETPLACE
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
        ServicesEntry.Marketplace -> LucideVectors.Plug
    }
