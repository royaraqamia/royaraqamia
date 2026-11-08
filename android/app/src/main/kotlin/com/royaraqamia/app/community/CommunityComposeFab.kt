package com.royaraqamia.app.community

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Button
import androidx.compose.material3.FloatingActionButton
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
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import com.royaraqamia.app.auth.SignInCopy
import com.royaraqamia.app.theme.LocalRoySpacing
import com.royaraqamia.app.theme.LocalRoyTypeScale
import com.royaraqamia.app.theme.Recipes
import com.royaraqamia.app.theme.RoyColors
import com.royaraqamia.app.ui.vectors.LucideVectors

/**
 * The community feed's compose control (#924).
 *
 * The page's `ComposeFab` is one round button: a signed-in member opens the
 * composer from it, and a guest gets the prompt that asks them to sign in rather
 * than a hard redirect. The app draws the same two faces; the words and the
 * glyph come from the shared copy source and the generated vectors, so a label
 * cannot be right on one client and wrong on the other.
 */
@Composable
fun CommunityComposeFab(
    signedIn: Boolean,
    onCompose: () -> Unit,
    onSignIn: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val state =
        if (signedIn) {
            CommunityComposeFabUiState.Ready
        } else {
            CommunityComposeFabUiState.Guest
        }
    var prompting by remember { mutableStateOf(false) }

    FloatingActionButton(
        onClick = {
            when (state) {
                is CommunityComposeFabUiState.Ready -> onCompose()
                is CommunityComposeFabUiState.Guest -> prompting = true
            }
        },
        modifier = modifier.testTag("community-compose-fab"),
        containerColor = RoyColors.primary,
        contentColor = RoyColors.primaryForeground,
    ) {
        Icon(
            imageVector = LucideVectors.PenLine,
            contentDescription = CommunityComposeFabCopy.NEW_POST_LABEL,
            modifier = Modifier.size(Recipes.Glyph.md),
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
                        imageVector = LucideVectors.PenLine,
                        contentDescription = null,
                        tint = Recipes.GuestMark.content,
                        modifier = Modifier.size(Recipes.Glyph.md),
                    )
                }
                Text(
                    text = CommunityComposeFabCopy.GUEST_TITLE,
                    style = type.body.copy(fontWeight = FontWeight.Bold),
                    color = RoyColors.foreground,
                    textAlign = TextAlign.Center,
                )
                Button(
                    onClick = onSignIn,
                    modifier = Modifier.fillMaxWidth().testTag("community-compose-sign-in"),
                ) {
                    Text(text = SignInCopy.SUBMIT, style = type.small)
                }
            }
        }
    }
}
