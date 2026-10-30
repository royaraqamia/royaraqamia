package com.royaraqamia.app.plans

import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.royaraqamia.app.theme.LocalRoySpacing
import com.royaraqamia.app.theme.LocalRoyTypeScale
import com.royaraqamia.app.theme.Recipes
import com.royaraqamia.app.ui.vectors.LucideVectors
import com.royaraqamia.app.theme.RoyColors
import com.royaraqamia.app.theme.RoyShape

/**
 * The plan card (#647, ADR-0098): the section the site's `/account/plan` opens
 * with, drawn from [UsageUiState] with no network of its own.
 *
 * It is the second client of `frontend/ui/account/plan-view.tsx`, not a
 * reinterpretation of it: the same four states, each in its own container, the same
 * corner ([RoyShape.card] is the site's `rounded-2xl`), the same surface alphas,
 * the same pill badge with the same success tone, and the same words — which are
 * generated from `shared/copy/plan-card.json` rather than retyped. `docs/mobile/
 * parity.json` lists the pair, and `npm run check:parity` fails a state or a string
 * that exists on one side only.
 *
 * Two things are deliberately Material's and not the site's: the loading state is
 * the site's two pulsing blocks drawn with `Box`, not a spinner, and the sign-in
 * action is the app's own `Button` — the site's gradient hero pill is a web
 * component with no native twin.
 */
@Composable
fun PlanCard(
    state: UsageUiState,
    onRetry: () -> Unit,
    onSignIn: () -> Unit,
    modifier: Modifier = Modifier,
) {
    when (state) {
        UsageUiState.Loading -> Skeleton(modifier)
        is UsageUiState.Ready -> CardShell(modifier) { Counters(state.model) }
        UsageUiState.SignedOut -> SignedOut(modifier, onSignIn)
        UsageUiState.Failed -> Failed(onRetry, modifier)
    }
}

/** The site's card surface: `rounded-2xl border border-border/50 bg-card/60`. */
@Composable
private fun CardShell(modifier: Modifier, content: @Composable ColumnScope.() -> Unit) {
    val spacing = LocalRoySpacing.current

    Card(
        modifier = modifier.fillMaxWidth(),
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

/**
 * The site's loading state: the recipe's blocks, pulsing — the page-level
 * skeleton it draws instead of the card (ADR-0098, ADR-0099).
 */
@Composable
private fun Skeleton(modifier: Modifier) {
    val transition = rememberInfiniteTransition(label = "plan-card-skeleton")
    val alpha by
        transition.animateFloat(
            initialValue = Recipes.Skeleton.pulseFrom,
            targetValue = Recipes.Skeleton.pulseTo,
            animationSpec = infiniteRepeatable(tween(Recipes.Skeleton.pulseMs), RepeatMode.Reverse),
            label = "plan-card-skeleton-alpha",
        )

    Column(
        modifier =
            modifier.fillMaxWidth().semantics {
                // The site labels the skeleton with the same sentence, so a screen
                // reader announces the card's state rather than two empty boxes.
                contentDescription = PlanCardCopy.LOADING_LABEL
            },
        verticalArrangement = Arrangement.spacedBy(Recipes.Skeleton.gap),
    ) {
        for (height in Recipes.Skeleton.blocks) {
            Box(
                modifier =
                    Modifier.fillMaxWidth()
                        .height(height)
                        .clip(Recipes.Skeleton.radius)
                        .background(Recipes.Skeleton.fill.copy(alpha = Recipes.Skeleton.fill.alpha * alpha))
            )
        }
    }
}

@Composable
private fun Counters(model: UsageScreenModel) {
    val type = LocalRoyTypeScale.current
    val spacing = LocalRoySpacing.current

    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(spacing.elementGapSm),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            modifier = Modifier.weight(1f),
            text = PlanCardCopy.CARD_TITLE,
            style = type.small.copy(fontWeight = FontWeight.Bold),
            color = MaterialTheme.colorScheme.onSurface,
        )
        Badge(model)
    }

    Column(verticalArrangement = Arrangement.spacedBy(Recipes.Row.gap)) {
        for (row in model.rows) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(spacing.elementGapSm),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    modifier = Modifier.weight(1f),
                    text = row.label,
                    style = Recipes.Row.label(type),
                    color = Recipes.Row.labelColor,
                )
                Text(
                    text =
                        if (model.unlimited) PlanCardCopy.UNLIMITED
                        else "${UsageCopy.count(row.used)} / ${UsageCopy.count(row.cap)}",
                    // A count never reads right-to-left, whatever the screen's
                    // direction is: `1,200 / 5,000` in an RTL paragraph would put
                    // the cap first.
                    style = Recipes.Row.value(type),
                    color = Recipes.Row.valueColor,
                )
            }
        }
    }

    if (model.plan == "pro" && model.expiresAt != null) {
        Text(
            text = UsageCopy.expires(PlanDates.label(model.expiresAt)),
            style = Recipes.Row.label(type),
            color = Recipes.Row.labelColor,
        )
    }
}

/** The site's badge: a pill, `text-xs font-bold`, tinted by the plan. */
@Composable
private fun Badge(model: UsageScreenModel) {
    val success = model.unlimited || model.plan == "pro"
    val border = if (success) RoyColors.success.copy(alpha = 0.3f) else RoyColors.border.copy(alpha = 0.6f)
    val container = if (success) RoyColors.success.copy(alpha = 0.1f) else RoyColors.secondary.copy(alpha = 0.8f)
    val content = if (success) RoyColors.success else RoyColors.secondaryForeground

    Surface(
        shape = RoyShape.pill,
        color = container,
        contentColor = content,
        border = BorderStroke(1.dp, border),
    ) {
        Text(
            text = if (model.unlimited) PlanCardCopy.UNLIMITED else UsageCopy.planLabel(model.plan),
            style = LocalRoyTypeScale.current.xs.copy(fontWeight = FontWeight.Bold),
            modifier = Modifier.padding(horizontal = 10.dp, vertical = 2.dp),
        )
    }
}

/** The site's guest prompt: a lock, the reason, and the way in. */
@Composable
private fun SignedOut(modifier: Modifier, onSignIn: () -> Unit) {
    val type = LocalRoyTypeScale.current
    val spacing = LocalRoySpacing.current

    CardShell(modifier) {
        Column(
            modifier = Modifier.fillMaxWidth(),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(spacing.elementGapSm),
        ) {
            Box(
                modifier =
                    Modifier.size(56.dp)
                        .clip(CircleShape)
                        .background(RoyColors.muted.copy(alpha = 0.6f)),
                contentAlignment = Alignment.Center,
            ) {
                Icon(
                    imageVector = LucideVectors.Lock,
                    contentDescription = null,
                    modifier = Modifier.size(Recipes.Glyph.md),
                )
            }
            Text(
                text = PlanCardCopy.SIGN_IN_TITLE,
                style = type.body.copy(fontWeight = FontWeight.Bold),
                color = MaterialTheme.colorScheme.onSurface,
                textAlign = TextAlign.Center,
            )
            Text(
                text = PlanCardCopy.SIGN_IN_BODY,
                style = type.xs,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                textAlign = TextAlign.Center,
            )
            Button(onClick = onSignIn, shape = RoyShape.pill) {
                Text(text = PlanCardCopy.SIGN_IN, style = type.small.copy(fontWeight = FontWeight.Bold))
            }
        }
    }
}

/** The site's failed state: the message, and the retry as the one action. */
@Composable
private fun Failed(onRetry: () -> Unit, modifier: Modifier = Modifier) {
    val type = LocalRoyTypeScale.current
    val spacing = LocalRoySpacing.current

    CardShell(modifier) {
        Column(
            modifier = Modifier.fillMaxWidth(),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(spacing.elementGapSm),
        ) {
            Text(
                text = PlanCardCopy.FAILED,
                style = type.small,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                textAlign = TextAlign.Center,
            )
            OutlinedButton(onClick = onRetry, shape = RoyShape.pill) {
                Icon(
                    imageVector = LucideVectors.RotateCw,
                    contentDescription = null,
                    modifier = Modifier.size(Recipes.Glyph.sm),
                )
                Text(
                    text = PlanCardCopy.RETRY,
                    style = type.small,
                    modifier = Modifier.padding(start = spacing.elementGapSm / 2f),
                )
            }
        }
    }
}
