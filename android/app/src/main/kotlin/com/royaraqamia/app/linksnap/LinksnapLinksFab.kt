package com.royaraqamia.app.linksnap

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Button
import androidx.compose.material3.Icon
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
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
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.window.Dialog
import com.royaraqamia.app.auth.SignInCopy
import com.royaraqamia.app.theme.LocalRoySpacing
import com.royaraqamia.app.theme.LocalRoyTypeScale
import com.royaraqamia.app.theme.Recipes
import com.royaraqamia.app.theme.RoyColors
import com.royaraqamia.app.ui.vectors.LucideVectors

/**
 * The shortener's own account door (#1208).
 *
 * The page's `LinksnapLinksFab` is one round button in the corner: a signed-in
 * member opens their owned links from it, and a guest gets the prompt that asks
 * them to sign in rather than a redirect off the page. The app draws the same two
 * faces from the same copy source and the same generated glyph, so the door
 * cannot be right on one client and wrong on the other.
 *
 * The button is the page's own box: 52, the site's gradient and the 22-high
 * `Link2` at the phone width, not a Material FAB - the layout contract measures
 * it, and a Material component would be a different circle.
 */
@Composable
fun LinksnapLinksFab(
    signedIn: Boolean,
    onOpenLinks: () -> Unit,
    onSignIn: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val state =
        if (signedIn) {
            LinksnapLinksFabUiState.Ready
        } else {
            LinksnapLinksFabUiState.Guest
        }
    var prompting by remember { mutableStateOf(false) }

    Box(
        modifier =
            modifier
                .testTag(LinksnapMetrics.FAB)
                .size(LinksnapMetrics.fabSize)
                .clip(CircleShape)
                .background(Brush.linearGradient(Recipes.Cta.stops))
                .clickable(role = Role.Button) {
                    when (state) {
                        is LinksnapLinksFabUiState.Ready -> onOpenLinks()
                        is LinksnapLinksFabUiState.Guest -> prompting = true
                    }
                }
                .semantics { contentDescription = LinksnapLinksFabCopy.LABEL },
        contentAlignment = Alignment.Center,
    ) {
        Icon(
            imageVector = LucideVectors.Link2,
            contentDescription = null,
            tint = Recipes.Cta.content,
            modifier =
                Modifier.testTag(LinksnapMetrics.FAB_GLYPH).size(LinksnapMetrics.fabIconSize),
        )
    }

    if (prompting) {
        GuestPrompt(
            onDismiss = { prompting = false },
            onSignIn = {
                prompting = false
                onSignIn()
            },
        )
    }
}

/** The page's guest prompt: the mark, the sentence and the way in. */
@Composable
private fun GuestPrompt(onDismiss: () -> Unit, onSignIn: () -> Unit) {
    val spacing = LocalRoySpacing.current
    val type = LocalRoyTypeScale.current

    Dialog(onDismissRequest = onDismiss) {
        Surface(
            shape = Recipes.Card.radius,
            color = RoyColors.background,
            border = Recipes.Card.border,
            modifier = Modifier.fillMaxWidth(0.94f),
        ) {
            Column(
                modifier = Modifier.padding(Recipes.Card.padding(spacing)),
                verticalArrangement = Arrangement.spacedBy(spacing.elementGapSm),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                Box(
                    modifier =
                        Modifier.size(Recipes.GuestMark.size)
                            .clip(Recipes.GuestMark.radius)
                            .background(Recipes.GuestMark.surface)
                            .border(Recipes.GuestMark.border, Recipes.GuestMark.radius),
                    contentAlignment = Alignment.Center,
                ) {
                    Icon(
                        imageVector = LucideVectors.Link2,
                        contentDescription = null,
                        tint = Recipes.GuestMark.content,
                        modifier = Modifier.size(Recipes.Glyph.md),
                    )
                }
                Text(
                    text = LinksnapLinksFabCopy.GUEST_TITLE,
                    style = type.body.copy(fontWeight = FontWeight.Bold),
                    color = RoyColors.foreground,
                    textAlign = TextAlign.Center,
                )
                Button(
                    onClick = onSignIn,
                    modifier = Modifier.fillMaxWidth().testTag("linksnap-links-sign-in"),
                ) {
                    Text(text = SignInCopy.SUBMIT, style = type.small)
                }
            }
        }
    }
}
