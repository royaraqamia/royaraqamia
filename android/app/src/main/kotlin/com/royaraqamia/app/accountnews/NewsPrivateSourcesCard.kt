package com.royaraqamia.app.accountnews

import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextDirection
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.royaraqamia.app.theme.LocalRoySpacing
import com.royaraqamia.app.theme.LocalRoyTypeScale
import com.royaraqamia.app.theme.Recipes
import com.royaraqamia.app.theme.RoyColors
import com.royaraqamia.app.ui.vectors.LucideVectors

/**
 * The site's one list of the reader's own sources (#950, ADR-0098, ADR-0130).
 *
 * The second client of `frontend/ui/account/news-private-sources.tsx`: the same
 * heading, ceiling badge, proposal field, rows and removal confirmation, from
 * `shared/copy/account-news-private.json` and `account-news-request.json`. One
 * row is one link whatever stage it reached: on its way, refused, or a feed that
 * is working or has stopped, and the delete acts on whichever it is.
 *
 * The digest that reads these feeds is on for every account, so nothing here
 * offers to switch it on.
 */
@Composable
fun NewsPrivateSourcesCard(
    state: NewsPrivateSourcesUiState,
    requestState: NewsSourceRequestUiState,
    url: String,
    onUrlChange: (String) -> Unit,
    onSubmit: () -> Unit,
    removing: NewsOwnedSource?,
    removingId: String?,
    actionError: String?,
    onRetry: () -> Unit,
    onAskRemove: (NewsOwnedSource) -> Unit,
    onDismissRemove: () -> Unit,
    onConfirmRemove: (NewsOwnedSource) -> Unit,
    modifier: Modifier = Modifier,
) {
    if (removing != null) {
        RemoveDialog(
            row = removing,
            busy = removingId == removing.id,
            onDismiss = onDismissRemove,
            onConfirm = { onConfirmRemove(removing) },
        )
    }

    when (state) {
        NewsPrivateSourcesUiState.Loading -> Skeleton(modifier)
        NewsPrivateSourcesUiState.Failed -> Failed(onRetry, modifier)
        is NewsPrivateSourcesUiState.Ready ->
            Ready(
                summary = state.summary,
                requestState = requestState,
                url = url,
                removingId = removingId,
                actionError = actionError,
                onUrlChange = onUrlChange,
                onSubmit = onSubmit,
                onAskRemove = onAskRemove,
                modifier = modifier,
            )
    }
}

@Composable
private fun Ready(
    summary: NewsOwnedSources,
    requestState: NewsSourceRequestUiState,
    url: String,
    removingId: String?,
    actionError: String?,
    onUrlChange: (String) -> Unit,
    onSubmit: () -> Unit,
    onAskRemove: (NewsOwnedSource) -> Unit,
    modifier: Modifier,
) {
    val spacing = LocalRoySpacing.current
    val type = LocalRoyTypeScale.current

    Column(
        modifier = modifier.fillMaxWidth().testTag("account-news-private"),
        verticalArrangement = Arrangement.spacedBy(spacing.elementGapSm),
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.Bottom,
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = AccountNewsPrivateCopy.HEADING,
                    style = type.small.copy(fontWeight = FontWeight.Bold),
                    color = MaterialTheme.colorScheme.onSurface,
                )
            }

            if (summary.limited) {
                CountBadge(used = summary.used, cap = summary.cap)
            }
        }

        if (actionError != null) Alert(actionError)

        NewsSourceRequestCard(
            state = requestState,
            url = url,
            onUrlChange = onUrlChange,
            onSubmit = onSubmit,
        )

        if (summary.rows.isEmpty()) {
            Text(
                text = AccountNewsPrivateCopy.EMPTY,
                modifier =
                    Modifier
                        .fillMaxWidth()
                        .testTag("account-news-private-empty")
                        .clip(Recipes.Card.radius)
                        .background(Recipes.Card.container)
                        .border(Recipes.Card.border, Recipes.Card.radius)
                        .padding(Recipes.Card.padding(spacing)),
                style = type.xs,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        } else {
            for (row in summary.rows) {
                OwnedRow(
                    row = row,
                    removing = removingId == row.id,
                    onRemove = { onAskRemove(row) },
                )
            }
        }

        if (summary.rows.any { it.state == "broken" }) {
            Row(
                modifier =
                    Modifier
                        .fillMaxWidth()
                        .clip(Recipes.Card.radius)
                        .background(RoyColors.destructive.copy(alpha = 0.05f))
                        .border(
                            BorderStroke(1.dp, RoyColors.destructive.copy(alpha = 0.3f)),
                            Recipes.Card.radius,
                        )
                        .padding(spacing.elementGapSm),
                horizontalArrangement = Arrangement.spacedBy(spacing.elementGapSm),
            ) {
                Icon(
                    imageVector = LucideVectors.Link2,
                    contentDescription = null,
                    tint = RoyColors.destructive,
                    modifier = Modifier.size(Recipes.Glyph.sm),
                )
                Text(
                    text = AccountNewsPrivateCopy.BROKEN_NOTICE,
                    style = type.xs,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}

@Composable
private fun OwnedRow(row: NewsOwnedSource, removing: Boolean, onRemove: () -> Unit) {
    val spacing = LocalRoySpacing.current
    val type = LocalRoyTypeScale.current

    Surface(
        modifier = Modifier.fillMaxWidth(),
        shape = Recipes.Card.radius,
        color = Recipes.Card.container,
        border = Recipes.Card.border,
    ) {
        Row(
            modifier = Modifier.padding(spacing.elementGapSm),
            horizontalArrangement = Arrangement.spacedBy(spacing.elementGapSm),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = row.name,
                    style = type.small.copy(fontWeight = FontWeight.Bold),
                    color = MaterialTheme.colorScheme.onSurface,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                Text(
                    text = row.url,
                    style = type.xs.copy(textDirection = TextDirection.Ltr),
                    color = Recipes.Row.labelColor,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                if (row.resolvedUrl != null && row.resolvedUrl != row.url) {
                    Text(
                        text = row.resolvedUrl,
                        style = type.xs.copy(textDirection = TextDirection.Ltr),
                        color = Recipes.Row.labelColor,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
                val failure = NewsText.failureLabel(row.failure)
                if (row.state == "needs_review" && failure != null) {
                    Text(
                        text = failure,
                        style = type.xs,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                if (row.state == "rejected" && row.note != null) {
                    Text(
                        text = row.note,
                        style = type.xs,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }

            StateBadge(state = row.state)

            TextButton(
                onClick = onRemove,
                enabled = !removing,
                modifier =
                    Modifier.semantics {
                        contentDescription = NewsText.removeLabel(row.name)
                    },
            ) {
                Icon(
                    imageVector = LucideVectors.Trash,
                    contentDescription = null,
                    tint = RoyColors.mutedForeground,
                    modifier = Modifier.size(Recipes.Glyph.sm),
                )
            }
        }
    }
}

@Composable
private fun StateBadge(state: String) {
    val type = LocalRoyTypeScale.current
    val tone =
        when (state) {
            "live" -> Recipes.Badge.success
            "rejected", "broken" ->
                Recipes.Badge.Tone(
                    surface = RoyColors.destructive.copy(alpha = 0.1f),
                    border = RoyColors.destructive.copy(alpha = 0.3f),
                    content = RoyColors.destructive,
                )
            "needs_review" ->
                Recipes.Badge.Tone(
                    surface = RoyColors.warning.copy(alpha = 0.1f),
                    border = RoyColors.warning.copy(alpha = 0.3f),
                    content = RoyColors.warning,
                )
            else -> Recipes.Badge.neutral
        }
    val size = Recipes.Badge.default(type)

    Surface(
        shape = Recipes.Badge.radius,
        color = tone.surface,
        border = BorderStroke(Recipes.Badge.borderWidth, tone.border),
    ) {
        Text(
            text = NewsText.ownedStateLabel(state),
            modifier = Modifier.padding(horizontal = size.paddingX, vertical = size.paddingY),
            style = size.text,
            color = tone.content,
        )
    }
}

@Composable
private fun RemoveDialog(
    row: NewsOwnedSource,
    busy: Boolean,
    onDismiss: () -> Unit,
    onConfirm: () -> Unit,
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(NewsText.removeTitle(row.state)) },
        text = { Text(NewsText.removeBody(row.state)) },
        confirmButton = {
            TextButton(onClick = onConfirm, enabled = !busy) {
                Text(NewsText.removeConfirm(row.state))
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) {
                Text(AccountNewsPrivateCopy.REMOVE_CANCEL)
            }
        },
    )
}

@Composable
private fun CountBadge(used: Int, cap: Int) {
    val type = LocalRoyTypeScale.current
    val size = Recipes.Badge.default(type)

    Surface(
        shape = Recipes.Badge.radius,
        color = Recipes.Badge.neutral.surface,
        border = BorderStroke(Recipes.Badge.borderWidth, Recipes.Badge.neutral.border),
    ) {
        Text(
            text = "$used / $cap",
            modifier = Modifier.padding(horizontal = size.paddingX, vertical = size.paddingY),
            style = size.text,
            color = Recipes.Badge.neutral.content,
        )
    }
}

@Composable
private fun Alert(message: String) {
    Surface(
        modifier = Modifier.fillMaxWidth(),
        shape = Recipes.Card.radius,
        color = RoyColors.destructive.copy(alpha = 0.05f),
        border = BorderStroke(1.dp, RoyColors.destructive.copy(alpha = 0.3f)),
    ) {
        Text(
            text = message,
            modifier =
                Modifier.padding(
                    horizontal = LocalRoySpacing.current.elementGap,
                    vertical = LocalRoySpacing.current.elementGapSm,
                ),
            style = LocalRoyTypeScale.current.small.copy(fontWeight = FontWeight.Bold),
            color = RoyColors.destructive,
        )
    }
}

@Composable
private fun Skeleton(modifier: Modifier) {
    val transition = rememberInfiniteTransition(label = "news-private-skeleton")
    val alpha by
        transition.animateFloat(
            initialValue = Recipes.Skeleton.pulseFrom,
            targetValue = Recipes.Skeleton.pulseTo,
            animationSpec = infiniteRepeatable(tween(Recipes.Skeleton.pulseMs), RepeatMode.Reverse),
            label = "news-private-skeleton-alpha",
        )

    Column(
        modifier =
            modifier.fillMaxWidth().semantics {
                contentDescription = AccountNewsPrivateCopy.LOADING_LABEL
            },
        verticalArrangement = Arrangement.spacedBy(Recipes.Skeleton.gap),
    ) {
        repeat(2) {
            Box(
                modifier =
                    Modifier.fillMaxWidth()
                        .height(Recipes.Skeleton.blocks.last())
                        .clip(Recipes.Skeleton.radius)
                        .background(
                            Recipes.Skeleton.fill.copy(alpha = Recipes.Skeleton.fill.alpha * alpha)
                        )
                        .border(Recipes.Skeleton.border, Recipes.Skeleton.radius)
            )
        }
    }
}

@Composable
private fun Failed(onRetry: () -> Unit, modifier: Modifier) {
    val spacing = LocalRoySpacing.current
    val type = LocalRoyTypeScale.current

    Surface(
        modifier = modifier.fillMaxWidth(),
        shape = Recipes.Card.radius,
        color = RoyColors.destructive.copy(alpha = 0.05f),
        border = BorderStroke(1.dp, RoyColors.destructive.copy(alpha = 0.3f)),
    ) {
        Column(
            modifier = Modifier.fillMaxWidth().padding(Recipes.Card.padding(spacing)),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(spacing.elementGapSm),
        ) {
            Text(
                text = AccountNewsPrivateCopy.LOAD_FAILED,
                style = type.small.copy(fontWeight = FontWeight.Bold),
                color = RoyColors.destructive,
                textAlign = TextAlign.Center,
            )
            OutlinedButton(onClick = onRetry, shape = MaterialTheme.shapes.large) {
                Icon(
                    imageVector = LucideVectors.RefreshCw,
                    contentDescription = null,
                    modifier = Modifier.size(Recipes.Glyph.sm),
                )
                Text(
                    text = AccountNewsPrivateCopy.RETRY,
                    style = type.small,
                    modifier = Modifier.padding(start = spacing.elementGapSm / 2f),
                )
            }
        }
    }
}
