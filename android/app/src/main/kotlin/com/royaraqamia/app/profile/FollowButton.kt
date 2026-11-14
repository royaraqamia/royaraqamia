package com.royaraqamia.app.profile

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.royaraqamia.app.theme.LocalRoyTypeScale
import com.royaraqamia.app.theme.Recipes
import com.royaraqamia.app.theme.RoyColors
import com.royaraqamia.app.theme.RoyTypeScale

/** The tags a test presses, named here so the screen and the test agree. */
object FollowButtonTags {
    const val BUTTON = "follow-button"
    const val CONFIRM = "follow-confirm"
}

/**
 * The one control the follow graph puts in a member's hands, as the site draws
 * it (`frontend/ui/shared/follow-button.tsx`).
 *
 * The follow face is the site's primary action ([Recipes.Cta]) at the header's
 * own height; unfollow and unblock are the quiet outline, because undo is not
 * what the header is asking for. A guest sees the same follow face: the press
 * is answered by the sign-in question rather than by a screen that pretends
 * there is nothing to press.
 *
 * Unfollowing asks twice, through the dialog the page uses, because it is the
 * only press here that loses something; the words come from the same generated
 * copy as the site's.
 */
@Composable
fun FollowButton(
    state: FollowButtonUiState,
    name: String,
    busy: Boolean,
    error: String?,
    onFollow: () -> Unit,
    onUnfollow: () -> Unit,
    onUnblock: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val type = LocalRoyTypeScale.current
    var confirming by remember { mutableStateOf(false) }

    Column(
        modifier = modifier,
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        when (state) {
            FollowButtonUiState.Self -> SelfPill(type)
            FollowButtonUiState.Following ->
                OutlineButton(
                    if (busy) FollowButtonCopy.BUSY_UNFOLLOW else FollowButtonCopy.UNFOLLOW,
                    enabled = !busy,
                ) { confirming = true }
            FollowButtonUiState.Blocked ->
                OutlineButton(
                    if (busy) FollowButtonCopy.BUSY_UNBLOCK else FollowButtonCopy.UNBLOCK,
                    enabled = !busy,
                    onClick = onUnblock,
                )
            FollowButtonUiState.NotFollowing,
            FollowButtonUiState.Guest ->
                PrimaryButton(
                    text = if (busy) FollowButtonCopy.BUSY_FOLLOW else FollowButtonCopy.FOLLOW,
                    enabled = !busy,
                    onClick = onFollow,
                )
        }

        if (error != null) {
            Text(text = error, style = type.xs, color = RoyColors.destructive)
        }
    }

    if (confirming) {
        AlertDialog(
            onDismissRequest = { confirming = false },
            title = {
                Text(
                    text = FollowButtonCopy.UNFOLLOW_TITLE,
                    style = type.small.copy(fontWeight = FontWeight.Bold),
                )
            },
            text = {
                Text(
                    text = FollowButtonCopy.UNFOLLOW_BODY.replace("{name}", name),
                    style = type.small,
                )
            },
            confirmButton = {
                TextButton(
                    onClick = {
                        confirming = false
                        onUnfollow()
                    },
                    modifier = Modifier.testTag(FollowButtonTags.CONFIRM),
                ) {
                    Text(text = FollowButtonCopy.CONFIRM_UNFOLLOW, color = RoyColors.destructive)
                }
            },
            dismissButton = {
                TextButton(onClick = { confirming = false }) {
                    Text(text = FollowButtonCopy.CANCEL)
                }
            },
        )
    }
}

/** The site's «أنت» pill: the viewer's own page has nothing to press. */
@Composable
private fun SelfPill(type: RoyTypeScale) {
    Box(
        modifier =
            Modifier
                .clip(Recipes.Cta.radius)
                .background(RoyColors.primary.copy(alpha = 0.1f))
                .border(1.dp, RoyColors.primary.copy(alpha = 0.4f), Recipes.Cta.radius)
                .padding(horizontal = 10.dp, vertical = 4.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text = FollowButtonCopy.YOU,
            style = type.xs.copy(fontWeight = FontWeight.Bold),
            color = RoyColors.primary,
        )
    }
}

/** The follow face: the site's primary action, one step shorter than a hero. */
@Composable
private fun PrimaryButton(text: String, enabled: Boolean, onClick: () -> Unit) {
    val type = LocalRoyTypeScale.current

    Box(
        modifier =
            Modifier
                .height(44.dp)
                .clip(Recipes.Cta.radius)
                .background(Brush.horizontalGradient(Recipes.Cta.stops))
                .border(Recipes.Cta.border, Recipes.Cta.radius)
                .clickable(enabled = enabled, role = Role.Button, onClick = onClick)
                .padding(horizontal = Recipes.Cta.paddingX)
                .testTag(FollowButtonTags.BUTTON),
        contentAlignment = Alignment.Center,
    ) {
        Text(text = text, style = Recipes.Cta.text(type), color = Recipes.Cta.content)
    }
}

/** Unfollow and unblock: the quiet outline, so undo never outshines the action. */
@Composable
private fun OutlineButton(text: String, enabled: Boolean, onClick: () -> Unit) {
    val type = LocalRoyTypeScale.current

    Box(
        modifier =
            Modifier
                .height(44.dp)
                .clip(Recipes.Cta.radius)
                .border(1.dp, RoyColors.border, Recipes.Cta.radius)
                .clickable(enabled = enabled, role = Role.Button, onClick = onClick)
                .padding(horizontal = Recipes.Cta.paddingX)
                .testTag(FollowButtonTags.BUTTON),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text = text,
            style = type.small.copy(fontWeight = FontWeight.Bold),
            color = RoyColors.foreground,
        )
    }
}
