package com.royaraqamia.app.profile

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.royaraqamia.app.theme.LocalRoyTypeScale
import com.royaraqamia.app.theme.Recipes
import com.royaraqamia.app.theme.RoyColors
import com.royaraqamia.app.ui.vectors.LucideVectors

/**
 * The second door on a member's profile: «مراسلة», a glyph and two words and
 * nothing else.
 *
 * The page draws it borderless and backgroundless beside the follow button
 * (`app/community/_components/member-chat-cta.tsx`): the header has one primary
 * action, and a second filled button next to it made two. The site hides it on
 * the viewer's own page, so the screen does the same by not drawing it.
 */
@Composable
fun ProfileChatCta(onClick: () -> Unit, modifier: Modifier = Modifier) {
    val type = LocalRoyTypeScale.current

    Row(
        modifier =
            modifier
                .height(44.dp)
                .clip(Recipes.Cta.radius)
                .clickable(role = Role.Button, onClick = onClick)
                .padding(horizontal = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        Icon(
            imageVector = LucideVectors.MessageCircle,
            contentDescription = null,
            tint = RoyColors.mutedForeground,
            modifier = Modifier.size(Recipes.Glyph.sm),
        )
        Text(
            text = ProfileChatCtaCopy.MESSAGE,
            style = type.small.copy(fontWeight = FontWeight.Bold),
            color = RoyColors.mutedForeground,
        )
    }
}
