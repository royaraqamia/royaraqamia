package com.royaraqamia.app.shared

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
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
 * A read the server answered and refused (#658, ADR-0031), the app's half of
 * `frontend/ui/shared/read-failure.tsx`.
 *
 * It is the other answer to a failed read: [NeedsConnection] is a request that
 * never left, this is a server that said no, and telling a member to check their
 * connection when the server refused them is the lie the ADR forbids. The caller
 * keeps the sentence; the title and the retry are the same everywhere.
 */
@Composable
fun ReadFailureNotice(
    message: String,
    state: ReadFailureState,
    modifier: Modifier = Modifier,
    onRetry: (() -> Unit)? = null,
) {
    when (state) {
        ReadFailureState.FailedInline -> InlineNotice(message = message, onRetry = onRetry, modifier = modifier)
        ReadFailureState.Failed -> BlockedNotice(message = message, onRetry = onRetry, modifier = modifier)
    }
}

@Composable
private fun InlineNotice(message: String, onRetry: (() -> Unit)?, modifier: Modifier) {
    val type = LocalRoyTypeScale.current
    val spacing = LocalRoySpacing.current

    Row(
        modifier =
            modifier
                .fillMaxWidth()
                .background(RoyColors.destructive.copy(alpha = 0.06f), Recipes.Card.radius)
                .padding(spacing.elementGapSm),
        horizontalArrangement = Arrangement.spacedBy(spacing.elementGapSm),
        verticalAlignment = Alignment.Top,
    ) {
        Icon(
            imageVector = LucideVectors.TriangleAlert,
            contentDescription = null,
            tint = RoyColors.destructive,
            modifier = Modifier.size(Recipes.Glyph.sm),
        )
        Column(
            modifier = Modifier.fillMaxWidth(),
            verticalArrangement = Arrangement.spacedBy(spacing.elementGapSm / 2),
        ) {
            Text(
                text = ReadFailureCopy.TITLE,
                style = type.small.copy(fontWeight = FontWeight.Bold),
                color = RoyColors.destructive,
            )
            Text(text = message, style = type.xs, color = RoyColors.foreground)
            if (onRetry != null) Retry(onRetry)
        }
    }
}

@Composable
private fun BlockedNotice(message: String, onRetry: (() -> Unit)?, modifier: Modifier) {
    val type = LocalRoyTypeScale.current
    val spacing = LocalRoySpacing.current

    Surface(
        modifier = modifier.fillMaxWidth(),
        shape = Recipes.Card.radius,
        color = RoyColors.destructive.copy(alpha = 0.05f),
        border = BorderStroke(1.dp, RoyColors.destructive.copy(alpha = 0.3f)),
    ) {
        Column(
            modifier = Modifier.padding(Recipes.Card.padding(spacing)),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(spacing.elementGapSm),
        ) {
            Icon(
                imageVector = LucideVectors.TriangleAlert,
                contentDescription = null,
                tint = RoyColors.destructive,
                modifier = Modifier.size(Recipes.Glyph.md),
            )
            Text(
                text = ReadFailureCopy.TITLE,
                style = type.h3.copy(fontWeight = FontWeight.Bold),
                color = RoyColors.foreground,
            )
            Text(text = message, style = type.small, color = RoyColors.mutedForeground)
            if (onRetry != null) Retry(onRetry)
        }
    }
}

@Composable
private fun Retry(onRetry: () -> Unit) {
    val type = LocalRoyTypeScale.current

    OutlinedButton(onClick = onRetry) {
        Text(text = ReadFailureCopy.RETRY, style = type.xs.copy(fontWeight = FontWeight.Bold))
    }
}
