package com.royaraqamia.app.shell

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.royaraqamia.app.ui.vectors.LucideVectors

/** The test handle for a tab, so a check can find one slot without its label. */
fun tabTestTag(tab: ShellTab): String = "shell-tab-${Routes.normalize(tab.route).trimStart('/').ifEmpty { "home" }}"

/**
 * The app's own tab bar (#647): the three primary destinations, at every width,
 * in the order the site draws them.
 *
 * The words are [TabBarCopy] and the glyphs are [LucideVectors] — the site's copy
 * source and the site's own drawings (ADR-0098, ADR-0100) — so the app cannot
 * describe a tab the site calls something else.
 *
 * The colours are the theme's rather than Tailwind palette values the stylesheet
 * names inline: the site's bar is `text-violet-400` / `text-neutral-400`, and in
 * Compose the same intent is the primary tone for the active slot and the muted
 * on-surface tone for the rest. Nothing here is a new colour: a bar that named a
 * palette value would be a colour the token file does not have (ADR-0096's rule,
 * on the app's side).
 */
@Composable
fun ShellTabBar(currentRoute: String, onSelect: (ShellTab) -> Unit, modifier: Modifier = Modifier) {
    val scheme = MaterialTheme.colorScheme

    Column(modifier.fillMaxWidth()) {
        // The site's `border-t border-neutral-800/80`, in the token's outline.
        Box(
            Modifier.fillMaxWidth()
                .height(1.dp)
                .background(scheme.outlineVariant.copy(alpha = 0.8f))
        )
        Row(
            modifier =
                Modifier.fillMaxWidth()
                    .background(scheme.background.copy(alpha = 0.95f))
                    .navigationBarsPadding()
                    .heightIn(min = 56.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceEvenly,
        ) {
            ShellTab.all.forEach { tab ->
                val active = tab.isActive(currentRoute)
                TabSlot(
                    tab = tab,
                    label = labelOf(tab),
                    icon = iconOf(tab),
                    active = active,
                    tint = if (active) scheme.primary else scheme.onSurfaceVariant,
                    onClick = { onSelect(tab) },
                    modifier = Modifier.weight(1f),
                )
            }
        }
    }
}

@Composable
private fun TabSlot(
    tab: ShellTab,
    label: String,
    icon: ImageVector,
    active: Boolean,
    tint: Color,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier =
            modifier.testTag(tabTestTag(tab))
                .clip(RoundedCornerShape(12.dp))
                .selectable(selected = active, role = Role.Tab, onClick = onClick)
                .padding(vertical = 8.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Icon(
            imageVector = icon,
            contentDescription = null,
            tint = tint,
            modifier = Modifier.size(20.dp),
        )
        Text(
            text = label,
            style = MaterialTheme.typography.labelSmall.copy(fontWeight = FontWeight.Bold),
            color = tint,
            maxLines = 1,
        )
    }
}

/** The site's label for a slot, from the one copy source both clients read. */
private fun labelOf(tab: ShellTab): String =
    when (tab) {
        ShellTab.Home -> TabBarCopy.HOME_LABEL
        ShellTab.Community -> TabBarCopy.COMMUNITY_LABEL
        ShellTab.Account -> TabBarCopy.ACCOUNT_LABEL
    }

/** The site's own glyph for a slot, converted from its `lucide-react` module. */
private fun iconOf(tab: ShellTab): ImageVector =
    when (tab) {
        ShellTab.Home -> LucideVectors.House
        ShellTab.Community -> LucideVectors.Users
        ShellTab.Account -> LucideVectors.UserRound
    }
