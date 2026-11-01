package com.royaraqamia.app.connectedapps

import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
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
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.royaraqamia.app.theme.LocalRoySpacing
import com.royaraqamia.app.theme.LocalRoyTypeScale
import com.royaraqamia.app.theme.Recipes
import com.royaraqamia.app.theme.RoyColors
import com.royaraqamia.app.theme.royInsetShadow
import com.royaraqamia.app.ui.vectors.LucideVectors

/**
 * The MCP clients connected to this account (#657, ADR-0098).
 *
 * The second client of `frontend/ui/account/mcp-connected-apps-view.tsx`, not a
 * reinterpretation of it: the same four states ([ConnectedAppsUiState]), the same
 * card surface ([Recipes.Card] is the site's `rounded-2xl border-border/50
 * bg-card/60`), the same destructive tint on a revoke, the same empty prompt, and
 * the same words — generated from `shared/copy/account-connected-apps.json`
 * rather than retyped, so a label cannot be right on one client and wrong on the
 * other. `docs/mobile/parity.json` lists the pair and `npm run check:parity`
 * fails a state or a string that exists on one side only.
 *
 * The confirmation lives here rather than in the caller because the site keeps it
 * in the view: a revoke is a destructive act, and the question has to be asked in
 * the same breath as the row it is about.
 *
 * A revoke is a request, not a hope. The card never removes the row itself — the
 * caller re-reads the list from the server, because a revocation that
 * half-succeeded must not look complete.
 */
@Composable
fun ConnectedAppsCard(
    state: ConnectedAppsUiState,
    onRetry: () -> Unit,
    onSignIn: () -> Unit,
    onDisconnect: (ConnectedApp) -> Unit,
    onDisconnectAll: () -> Unit,
    onConnectNew: () -> Unit,
    modifier: Modifier = Modifier,
    actionError: String? = null,
) {
    when (state) {
        ConnectedAppsUiState.Loading -> Skeleton(modifier)
        ConnectedAppsUiState.SignedOut -> SignedOut(modifier, onSignIn)
        ConnectedAppsUiState.Failed -> Failed(onRetry, modifier)
        is ConnectedAppsUiState.Ready ->
            Ready(
                apps = state.apps,
                actionError = actionError,
                onDisconnect = onDisconnect,
                onDisconnectAll = onDisconnectAll,
                onConnectNew = onConnectNew,
                modifier = modifier,
            )
    }
}

/** The two things a confirmation can be about: one client, or every client. */
private sealed interface DisconnectTarget {
    data class One(val app: ConnectedApp) : DisconnectTarget

    data object All : DisconnectTarget
}

/**
 * The list, in the site's order: the alert (if a revoke was refused), the rows and
 * the disconnect-all action, then the way to connect a new client.
 */
@Composable
private fun Ready(
    apps: List<ConnectedApp>,
    actionError: String?,
    onDisconnect: (ConnectedApp) -> Unit,
    onDisconnectAll: () -> Unit,
    onConnectNew: () -> Unit,
    modifier: Modifier,
) {
    val spacing = LocalRoySpacing.current
    var target by remember { mutableStateOf<DisconnectTarget?>(null) }

    Column(
        modifier = modifier.fillMaxWidth(),
        verticalArrangement = Arrangement.spacedBy(spacing.elementGap),
    ) {
        if (actionError != null) Alert(actionError)

        if (apps.isEmpty()) {
            Empty()
        } else {
            Column(verticalArrangement = Arrangement.spacedBy(spacing.elementGapSm)) {
                for (app in apps) {
                    AppRow(app = app, onDisconnect = { target = DisconnectTarget.One(app) })
                }
            }

            DisconnectAllButton(onClick = { target = DisconnectTarget.All })
        }

        ConnectNewButton(onClick = onConnectNew)
    }

    val chosen = target
    if (chosen != null) {
        Confirm(
            target = chosen,
            onDismiss = { target = null },
            onConfirm = {
                target = null
                when (chosen) {
                    is DisconnectTarget.One -> onDisconnect(chosen.app)
                    DisconnectTarget.All -> onDisconnectAll()
                }
            },
        )
    }
}

/** One client: the site's glyph and name, when it was last used, and its revoke. */
@Composable
private fun AppRow(app: ConnectedApp, onDisconnect: () -> Unit) {
    val type = LocalRoyTypeScale.current
    val spacing = LocalRoySpacing.current

    Surface(
        modifier = Modifier.fillMaxWidth(),
        shape = Recipes.Card.radius,
        color = Recipes.Card.container,
        border = Recipes.Card.border,
    ) {
        Row(
            modifier =
                Modifier.padding(
                    horizontal = spacing.elementGap,
                    // The site's `py-3.5` is between the two element steps, and a
                    // port takes the token rather than the pixel (ADR-0100).
                    vertical = spacing.elementGapSm,
                ),
            horizontalArrangement = Arrangement.spacedBy(spacing.elementGapSm),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(
                imageVector = LucideVectors.Plug,
                contentDescription = null,
                tint = RoyColors.primary,
                modifier = Modifier.size(Recipes.Glyph.sm),
            )

            Column(
                modifier = Modifier.weight(1f),
                verticalArrangement = Arrangement.spacedBy(spacing.elementGapSm / 2f),
            ) {
                Text(
                    text = ConnectedAppsText.name(app),
                    style = type.small.copy(fontWeight = FontWeight.Bold),
                    color = MaterialTheme.colorScheme.onSurface,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                Text(
                    text = "${ConnectedAppsText.lastUsed(app)} · ${ConnectedAppsText.connectedSince(app)}",
                    style = type.xs,
                    color = Recipes.Row.labelColor,
                )
            }

            DestructiveButton(
                label = ConnectedAppsCopy.DISCONNECT,
                contentDescription = ConnectedAppsText.disconnectLabel(app),
                onClick = onDisconnect,
            )
        }
    }
}

/** The site's revoke pill: a glyph and a word, on the destructive tint. */
@Composable
private fun DestructiveButton(label: String, contentDescription: String, onClick: () -> Unit) {
    val type = LocalRoyTypeScale.current
    val spacing = LocalRoySpacing.current
    val tint = RoyColors.destructive

    Surface(
        onClick = onClick,
        shape = MaterialTheme.shapes.large,
        color = tint.copy(alpha = 0.05f),
        border = BorderStroke(1f.dp, tint.copy(alpha = 0.25f)),
    ) {
        Row(
            modifier =
                Modifier.semantics { this.contentDescription = contentDescription }
                    .height(Recipes.Badge.default(type).height + spacing.elementGapSm)
                    .padding(horizontal = spacing.elementGapSm),
            horizontalArrangement = Arrangement.spacedBy(spacing.elementGapSm / 2f),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(
                imageVector = LucideVectors.Unplug,
                contentDescription = null,
                tint = tint.copy(alpha = 0.9f),
                modifier = Modifier.size(Recipes.Glyph.sm),
            )
            Text(
                text = label,
                style = type.xs.copy(fontWeight = FontWeight.Bold),
                color = tint.copy(alpha = 0.9f),
            )
        }
    }
}

/** The card's own `فصل كل التَّطبيقات`: one row wide, same tint, same question. */
@Composable
private fun DisconnectAllButton(onClick: () -> Unit) {
    val type = LocalRoyTypeScale.current
    val tint = RoyColors.destructive

    Surface(
        onClick = onClick,
        modifier = Modifier.fillMaxWidth(),
        shape = Recipes.Card.radius,
        color = tint.copy(alpha = 0.05f),
        border = BorderStroke(1f.dp, tint.copy(alpha = 0.25f)),
    ) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(vertical = LocalRoySpacing.current.elementGap),
            horizontalArrangement =
                Arrangement.spacedBy(
                    LocalRoySpacing.current.elementGapSm,
                    Alignment.CenterHorizontally,
                ),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(
                imageVector = LucideVectors.Unplug,
                contentDescription = null,
                tint = tint.copy(alpha = 0.9f),
                modifier = Modifier.size(Recipes.Glyph.sm),
            )
            Text(
                text = ConnectedAppsCopy.DISCONNECT_ALL,
                style = type.small.copy(fontWeight = FontWeight.Bold),
                color = tint.copy(alpha = 0.9f),
            )
        }
    }
}

/** The empty state: the site's circle, its title and the reason to connect one. */
@Composable
private fun Empty() {
    val type = LocalRoyTypeScale.current
    val spacing = LocalRoySpacing.current

    CardShell {
        Column(
            modifier = Modifier.fillMaxWidth(),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(spacing.elementGapSm),
        ) {
            Box(
                modifier =
                    Modifier.size(Recipes.GuestMark.size)
                        .royInsetShadow(
                            shape = Recipes.GuestMark.radius,
                            color = Recipes.GuestMark.shadowColor,
                            blur = Recipes.GuestMark.shadowBlur,
                            offsetY = Recipes.GuestMark.shadowOffsetY,
                        )
                        .clip(Recipes.GuestMark.radius)
                        .background(Recipes.GuestMark.surface)
                        .border(Recipes.GuestMark.border, Recipes.GuestMark.radius),
                contentAlignment = Alignment.Center,
            ) {
                Icon(
                    imageVector = LucideVectors.Plug,
                    contentDescription = null,
                    tint = Recipes.GuestMark.content,
                    modifier = Modifier.size(Recipes.Glyph.md),
                )
            }
            Text(
                text = ConnectedAppsCopy.EMPTY_TITLE,
                style = type.body.copy(fontWeight = FontWeight.Bold),
                color = MaterialTheme.colorScheme.onSurface,
                textAlign = TextAlign.Center,
            )
            Text(
                text = ConnectedAppsCopy.EMPTY_BODY,
                style = type.xs,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                textAlign = TextAlign.Center,
            )
        }
    }
}

/** The site's `ربط تطبيق جديد`: a full-width card that opens the MCP guide. */
@Composable
private fun ConnectNewButton(onClick: () -> Unit) {
    val type = LocalRoyTypeScale.current
    val spacing = LocalRoySpacing.current

    Surface(
        onClick = onClick,
        modifier = Modifier.fillMaxWidth(),
        shape = Recipes.Card.radius,
        color = Recipes.Card.container,
        border = Recipes.Card.border,
    ) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(vertical = spacing.elementGap),
            horizontalArrangement = Arrangement.spacedBy(spacing.elementGapSm, Alignment.CenterHorizontally),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(
                imageVector = LucideVectors.Plus,
                contentDescription = null,
                tint = RoyColors.primary,
                modifier = Modifier.size(Recipes.Glyph.sm),
            )
            Text(
                text = ConnectedAppsCopy.CONNECT_NEW,
                style = type.small.copy(fontWeight = FontWeight.Bold),
                color = MaterialTheme.colorScheme.onSurface,
            )
        }
    }
}

/** A refused revoke: the server's own reason, in the site's alert tone. */
@Composable
private fun Alert(message: String) {
    Surface(
        modifier = Modifier.fillMaxWidth(),
        shape = Recipes.Card.radius,
        color = RoyColors.destructive.copy(alpha = 0.05f),
        border = BorderStroke(1f.dp, RoyColors.destructive.copy(alpha = 0.3f)),
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

/** The question before a revoke, worded from the card's own copy. */
@Composable
private fun Confirm(target: DisconnectTarget, onDismiss: () -> Unit, onConfirm: () -> Unit) {
    val type = LocalRoyTypeScale.current

    AlertDialog(
        onDismissRequest = onDismiss,
        title = {
            Text(
                text =
                    when (target) {
                        is DisconnectTarget.One -> ConnectedAppsCopy.CONFIRM_DISCONNECT_TITLE
                        DisconnectTarget.All -> ConnectedAppsCopy.CONFIRM_DISCONNECT_ALL_TITLE
                    },
                style = type.small.copy(fontWeight = FontWeight.Bold),
            )
        },
        text = {
            Text(
                text =
                    when (target) {
                        is DisconnectTarget.One -> ConnectedAppsText.confirmMessage(target.app)
                        DisconnectTarget.All -> ConnectedAppsCopy.CONFIRM_DISCONNECT_ALL_MESSAGE
                    },
                style = type.small,
            )
        },
        confirmButton = {
            TextButton(onClick = onConfirm) {
                Text(
                    text =
                        when (target) {
                            is DisconnectTarget.One -> ConnectedAppsCopy.CONFIRM_DISCONNECT
                            DisconnectTarget.All -> ConnectedAppsCopy.CONFIRM_DISCONNECT_ALL
                        },
                )
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text(ConnectedAppsCopy.CANCEL) }
        },
    )
}

/**
 * The site's loading state: two pulsing cards, drawn rather than spun. The block
 * height is the recipe's small step, which is the `h-20` these two rows are.
 */
@Composable
private fun Skeleton(modifier: Modifier) {
    val transition = rememberInfiniteTransition(label = "connected-apps-skeleton")
    val alpha by
        transition.animateFloat(
            initialValue = Recipes.Skeleton.pulseFrom,
            targetValue = Recipes.Skeleton.pulseTo,
            animationSpec = infiniteRepeatable(tween(Recipes.Skeleton.pulseMs), RepeatMode.Reverse),
            label = "connected-apps-skeleton-alpha",
        )

    Column(
        modifier =
            modifier.fillMaxWidth().semantics {
                // The site labels the skeleton with the same sentence, so a screen
                // reader announces the state rather than two empty boxes.
                contentDescription = ConnectedAppsCopy.LOADING_LABEL
            },
        verticalArrangement = Arrangement.spacedBy(Recipes.Skeleton.gap),
    ) {
        repeat(2) {
            Box(
                modifier =
                    Modifier.fillMaxWidth()
                        .height(Recipes.Skeleton.blocks.last())
                        .clip(Recipes.Skeleton.radius)
                        .background(Recipes.Skeleton.fill.copy(alpha = Recipes.Skeleton.fill.alpha * alpha))
                        .border(Recipes.Skeleton.border, Recipes.Skeleton.radius)
            )
        }
    }
}

/** The site's guest state: one way in, and nothing else — the page has no list to show. */
@Composable
private fun SignedOut(modifier: Modifier, onSignIn: () -> Unit) {
    val type = LocalRoyTypeScale.current

    Column(
        modifier = modifier.fillMaxWidth(),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Box(
            modifier =
                Modifier.height(Recipes.Cta.height)
                    .widthIn(min = Recipes.Cta.minWidth)
                    .shadow(
                        elevation = Recipes.Cta.bloomY,
                        shape = Recipes.Cta.radius,
                        ambientColor = Recipes.Cta.bloom,
                        spotColor = Recipes.Cta.bloom,
                    )
                    .clip(Recipes.Cta.radius)
                    .background(Brush.horizontalGradient(Recipes.Cta.stops))
                    .border(Recipes.Cta.border, Recipes.Cta.radius)
                    .clickable(onClick = onSignIn)
                    .padding(horizontal = Recipes.Cta.paddingX),
            contentAlignment = Alignment.Center,
        ) {
            Text(
                text = ConnectedAppsCopy.SIGN_IN,
                style = Recipes.Cta.text(type),
                color = Recipes.Cta.content,
            )
        }
    }
}

/** The site's failure state: the sentence, and the retry as the one action. */
@Composable
private fun Failed(onRetry: () -> Unit, modifier: Modifier = Modifier) {
    val type = LocalRoyTypeScale.current
    val spacing = LocalRoySpacing.current

    Surface(
        modifier = modifier.fillMaxWidth(),
        shape = Recipes.Card.radius,
        color = RoyColors.destructive.copy(alpha = 0.05f),
        border = BorderStroke(1f.dp, RoyColors.destructive.copy(alpha = 0.3f)),
    ) {
        Column(
            modifier = Modifier.fillMaxWidth().padding(Recipes.Card.padding(spacing)),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(spacing.elementGapSm),
        ) {
            Text(
                text = ConnectedAppsCopy.FAILED,
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
                    text = ConnectedAppsCopy.RETRY,
                    style = type.small,
                    modifier = Modifier.padding(start = spacing.elementGapSm / 2f),
                )
            }
        }
    }
}

/** The site's card surface, shared by the empty state and the alert. */
@Composable
private fun CardShell(content: @Composable ColumnScope.() -> Unit) {
    val spacing = LocalRoySpacing.current

    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = Recipes.Card.radius,
        colors = CardDefaults.cardColors(containerColor = Recipes.Card.container),
        border = Recipes.Card.border,
    ) {
        Column(
            modifier = Modifier.padding(Recipes.Card.padding(spacing)),
            verticalArrangement = Arrangement.spacedBy(Recipes.Card.gap(spacing)),
            content = content,
        )
    }
}
