package com.royaraqamia.app.shared

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Icon
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.royaraqamia.app.theme.LocalRoySpacing
import com.royaraqamia.app.theme.LocalRoyTypeScale
import com.royaraqamia.app.theme.Recipes
import com.royaraqamia.app.theme.RoyColors
import com.royaraqamia.app.ui.vectors.LucideVectors

/**
 * The one needs-connection block for a server-owned surface (#658, ADR-0031),
 * the app's half of `frontend/ui/shared/needs-connection.tsx`.
 *
 * It exists so an online-only surface can never answer a failed request with the
 * empty state it shows for real absence: a feed with no rows and an unreachable
 * server look identical to a screen that only knows "the list is empty", and the
 * difference is the whole point of the ADR. The title says *why* — there is no
 * path to the server — and [message] says *what* was lost, in the surface's own
 * words, because each surface knows.
 *
 * The glyph is the site's (`CloudOff`) from the generated vectors rather than a
 * redrawing, so the two clients cannot pick different pictures for one state.
 */
@Composable
fun NeedsConnection(
    message: String,
    state: NeedsConnectionState,
    modifier: Modifier = Modifier,
    onRetry: (() -> Unit)? = null,
) {
    when (state) {
        NeedsConnectionState.Inline -> InlineBlock(message = message, onRetry = onRetry, modifier = modifier)
        NeedsConnectionState.Block -> Blocked(message = message, onRetry = onRetry, modifier = modifier)
    }
}

@Composable
private fun InlineBlock(message: String, onRetry: (() -> Unit)?, modifier: Modifier) {
    val type = LocalRoyTypeScale.current
    val spacing = LocalRoySpacing.current

    Row(
        modifier =
            modifier
                .fillMaxWidth()
                .background(RoyColors.warning.copy(alpha = 0.08f), Recipes.Card.radius)
                .padding(spacing.elementGapSm),
        horizontalArrangement = Arrangement.spacedBy(spacing.elementGapSm),
        verticalAlignment = Alignment.Top,
    ) {
        Icon(
            imageVector = LucideVectors.CloudOff,
            contentDescription = null,
            tint = RoyColors.warning,
            modifier = Modifier.size(Recipes.Glyph.sm),
        )
        Column(
            modifier = Modifier.fillMaxWidth(),
            verticalArrangement = Arrangement.spacedBy(spacing.elementGapSm / 2),
        ) {
            Text(
                text = NeedsConnectionCopy.TITLE,
                style = type.small.copy(fontWeight = FontWeight.Bold),
                color = RoyColors.warning,
            )
            Text(text = message, style = type.xs, color = RoyColors.warningForeground)
            if (onRetry != null) RetryButton(onRetry)
        }
    }
}

@Composable
private fun Blocked(message: String, onRetry: (() -> Unit)?, modifier: Modifier) {
    val type = LocalRoyTypeScale.current
    val spacing = LocalRoySpacing.current

    Surface(
        modifier = modifier.fillMaxWidth(),
        shape = Recipes.Card.radius,
        color = RoyColors.warning.copy(alpha = 0.06f),
        border = BorderStroke(1.dp, RoyColors.warning.copy(alpha = 0.4f)),
    ) {
        Column(
            modifier = Modifier.padding(Recipes.Card.padding(spacing)),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(spacing.elementGapSm),
        ) {
            Box(
                modifier =
                    Modifier.background(RoyColors.warning.copy(alpha = 0.12f), Recipes.GuestMark.radius)
                        .padding(spacing.elementGapSm),
            ) {
                Icon(
                    imageVector = LucideVectors.CloudOff,
                    contentDescription = null,
                    tint = RoyColors.warning,
                    modifier = Modifier.size(Recipes.Glyph.md),
                )
            }
            Text(
                text = NeedsConnectionCopy.TITLE,
                style = type.h3.copy(fontWeight = FontWeight.Bold),
                color = RoyColors.warningForeground,
            )
            Text(text = message, style = type.small, color = RoyColors.mutedForeground)
            if (onRetry != null) RetryButton(onRetry)
        }
    }
}

@Composable
private fun RetryButton(onRetry: () -> Unit) {
    val type = LocalRoyTypeScale.current

    OutlinedButton(onClick = onRetry) {
        Text(text = NeedsConnectionCopy.RETRY, style = type.xs.copy(fontWeight = FontWeight.Bold))
    }
}
