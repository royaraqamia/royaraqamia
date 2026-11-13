package com.royaraqamia.app.shared

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Icon
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
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
    val badgeShape = RoundedCornerShape(16.dp)

    // The site's own card (`EmptyState`, `variant="card"`, at 393 CSS px): a 56
    // badge over a 16-bold title, a 12 description and a 40-high retry, with the
    // page's 48/16 outer padding. The raster is what proves it (#1345).
    Column(
        modifier = modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 48.75.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Box(
            modifier =
                Modifier.size(56.dp)
                    .background(RoyColors.background.copy(alpha = 0.8f), badgeShape)
                    .border(1.dp, RoyColors.primary.copy(alpha = 0.2f), badgeShape),
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                imageVector = LucideVectors.CloudOff,
                contentDescription = null,
                tint = RoyColors.primary,
                modifier = Modifier.size(24.dp),
            )
        }
        Spacer(Modifier.height(20.dp))
        Text(
            text = NeedsConnectionCopy.TITLE,
            style = type.body.copy(fontSize = 16.sp, lineHeight = 24.sp, fontWeight = FontWeight.Bold),
            color = RoyColors.foreground,
            textAlign = TextAlign.Center,
        )
        Spacer(Modifier.height(8.dp))
        Text(
            text = message,
            style = type.xs.copy(fontSize = 12.sp, lineHeight = 19.5.sp),
            color = RoyColors.mutedForeground,
            textAlign = TextAlign.Center,
        )
        if (onRetry != null) {
            Spacer(Modifier.height(24.dp))
            OutlinedButton(
                onClick = onRetry,
                modifier = Modifier.height(40.dp),
                contentPadding = PaddingValues(horizontal = 16.dp, vertical = 8.dp),
            ) {
                Text(
                    text = NeedsConnectionCopy.RETRY,
                    style =
                        type.body.copy(
                            fontSize = 14.sp,
                            lineHeight = 20.sp,
                            fontWeight = FontWeight.Medium,
                        ),
                )
            }
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
