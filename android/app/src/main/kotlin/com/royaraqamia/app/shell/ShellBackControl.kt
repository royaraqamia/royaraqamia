package com.royaraqamia.app.shell

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Icon
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import com.royaraqamia.app.theme.Recipes
import com.royaraqamia.app.theme.RoyColors
import com.royaraqamia.app.ui.vectors.LucideVectors

/** The site's `size-11` floating control (`SecondaryHeader.tsx`). */
internal val BackControlSize = 44.dp

/**
 * The floating back control a secondary page wears (#967).
 *
 * It is the page's own control, not a second drawing of it: the box is the
 * site's `size-11` (`44dp`), the glyph is the site's `ArrowRight` at `size-4`,
 * and the word announced to a screen reader is the site's
 * `رجوع` from `shared/copy/back-control.json` (ADR-0098, ADR-0100). Where it
 * sits — the inline-start corner, its offset and the page's reserved band — is
 * [ShellFrame]'s, because that is the frame's layout rather than the control's.
 *
 * There is no bar and no title here: a secondary page names itself in its own
 * content, and the control floats over the band the way `SecondaryHeader` does
 * (ADR-0156).
 */
@Composable
fun ShellBackControl(onClick: () -> Unit, modifier: Modifier = Modifier) {
    Box(
        modifier =
            modifier
                .size(BackControlSize)
                .clip(CircleShape)
                .background(RoyColors.card)
                .border(1.dp, RoyColors.border.copy(alpha = 0.6f), CircleShape)
                .clickable(onClick = onClick)
                .semantics {
                    role = Role.Button
                    contentDescription = BackControlCopy.LABEL
                },
        contentAlignment = Alignment.Center,
    ) {
        Icon(
            imageVector = LucideVectors.ArrowRight,
            contentDescription = null,
            tint = RoyColors.foreground,
            modifier = Modifier.size(Recipes.Glyph.sm),
        )
    }
}
