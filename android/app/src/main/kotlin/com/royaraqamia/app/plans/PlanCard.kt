package com.royaraqamia.app.plans

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
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Button
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
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.royaraqamia.app.theme.LocalRoySpacing
import com.royaraqamia.app.theme.LocalRoyTypeScale
import com.royaraqamia.app.theme.Recipes
import com.royaraqamia.app.theme.royInsetShadow
import com.royaraqamia.app.ui.vectors.LucideVectors
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
        is UsageUiState.Ready -> Ready(state.model, modifier)
        UsageUiState.SignedOut -> SignedOut(modifier, onSignIn)
        UsageUiState.Failed -> Failed(onRetry, modifier)
    }
}

/**
 * The page's two sections, in the page's order: the card, then the activation
 * history (ADR-0098). The site wraps them in `space-y-4`; the gap here is the
 * spacing token step, because a port uses the fluid scale rather than a `sm:`
 * utility (ADR-0100).
 */
@Composable
private fun Ready(model: UsageScreenModel, modifier: Modifier) {
    Column(
        modifier = modifier.fillMaxWidth(),
        verticalArrangement = Arrangement.spacedBy(LocalRoySpacing.current.elementGap),
    ) {
        CardShell { Counters(model) }
        History(model.activations)
    }
}

/**
 * The site's activation history: what the plan cost, how it was paid, when it
 * started and when it runs out — or the empty line that names the free plan the
 * member is on.
 */
@Composable
private fun History(activations: List<UsageScreenModel.Activation>) {
    val type = LocalRoyTypeScale.current
    val spacing = LocalRoySpacing.current

    Column(
        modifier = Modifier.fillMaxWidth(),
        verticalArrangement = Arrangement.spacedBy(spacing.elementGapSm),
    ) {
        Text(
            text = PlanCardCopy.HISTORY_TITLE,
            style = type.small.copy(fontWeight = FontWeight.Bold),
            color = MaterialTheme.colorScheme.onSurface,
        )

        if (activations.isEmpty()) {
            CardShell {
                Text(
                    text = PlanCardCopy.HISTORY_EMPTY.replace("{plan}", PlanCardCopy.PLAN_FREE),
                    style = type.small,
                    color = Recipes.Row.labelColor,
                )
            }
        } else {
            for (activation in activations) {
                ActivationRow(activation)
            }
        }
    }
}

@Composable
private fun ActivationRow(activation: UsageScreenModel.Activation) {
    val type = LocalRoyTypeScale.current

    CardShell {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(LocalRoySpacing.current.elementGapSm),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                modifier = Modifier.weight(1f),
                text = PlanMoney.label(activation.amountCents, activation.currency),
                style = type.small.copy(fontWeight = FontWeight.Bold),
                color = MaterialTheme.colorScheme.onSurface,
            )
            Text(
                text = UsageCopy.methodLabel(activation.method),
                style = type.xs,
                color = Recipes.Row.labelColor,
            )
        }

        Text(
            text =
                PlanCardCopy.ACTIVATED_LINE.replace("{activated}", PlanDates.label(activation.activatedAt))
                    .replace("{expires}", PlanDates.label(activation.expiresAt)),
            style = type.xs,
            color = Recipes.Row.labelColor,
        )

        if (activation.note != null) {
            Text(
                text = PlanCardCopy.NOTE_LINE.replace("{note}", activation.note),
                style = type.xs,
                color = Recipes.Row.labelColor,
            )
        }
    }
}

/**
 * The site's card surface: `rounded-2xl border border-border/50 bg-card/60`.
 *
 * The one-pixel padding is the site's border, which CSS counts inside the card's
 * box (`box-sizing: border-box`) while Compose paints it without taking layout
 * space; without it the card's content would sit a pixel high and its height would
 * miss the page's by two.
 */
@Composable
private fun CardShell(modifier: Modifier = Modifier, content: @Composable ColumnScope.() -> Unit) {
    val spacing = LocalRoySpacing.current

    Column(
        modifier =
            modifier
                .fillMaxWidth()
                .clip(Recipes.Card.radius)
                .background(Recipes.Card.container)
                .border(Recipes.Card.border, Recipes.Card.radius)
                .padding(PlanScreenMetrics.cardBorder),
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

    if (model.unlimited) {
        Text(
            text = PlanCardCopy.UNLIMITED,
            style = type.small.copy(fontWeight = FontWeight.Bold),
            color = MaterialTheme.colorScheme.onSurface,
        )
    } else {
        UsageProgress(model)
    }

    if (model.plan == "pro" && model.expiresAt != null) {
        Text(
            text = UsageCopy.expires(PlanDates.label(model.expiresAt)),
            style = Recipes.Row.label(type),
            color = Recipes.Row.labelColor,
        )
    }
}

/**
 * The page's one bar: the standing owned-item caps summed, and how much of them
 * the account is holding. The track is [Recipes.Progress] on both clients, and
 * the fill grows from the track's start, which is its right edge in the app's
 * right-to-left layout — the site's `transform-origin: right` is the same edge.
 *
 * The percentage is drawn in the digits face ([Recipes.Progress.value]), so an
 * Arabic-locale phone shows ASCII figures, as the site does.
 */
@Composable
private fun UsageProgress(model: UsageScreenModel) {
    val type = LocalRoyTypeScale.current
    val spacing = LocalRoySpacing.current

    Row(
        modifier =
            Modifier.fillMaxWidth()
                // The site's progressbar carries the same name, so a screen reader
                // announces what the bar is before the number it reads.
                .semantics { contentDescription = PlanCardCopy.USAGE_LABEL },
        horizontalArrangement = Arrangement.spacedBy(Recipes.Progress.gap(spacing)),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            modifier =
                Modifier.weight(1f)
                    .height(Recipes.Progress.height)
                    .clip(Recipes.Progress.radius)
                    .background(Recipes.Progress.track),
        ) {
            Box(
                modifier =
                    Modifier.fillMaxWidth(model.share / 100f)
                        .height(Recipes.Progress.height)
                        .clip(Recipes.Progress.radius)
                        .background(Recipes.Progress.fill)
            )
        }
        Text(
            text = UsageCopy.percent(model.share),
            style = Recipes.Progress.value(type),
            color = Recipes.Progress.valueColor,
        )
    }
}

/** The site's badge: a pill, `text-xs font-bold`, tinted by the plan. */
@Composable
private fun Badge(model: UsageScreenModel) {
    val tone = if (model.unlimited || model.plan == "pro") Recipes.Badge.success else Recipes.Badge.neutral
    val size = Recipes.Badge.default(LocalRoyTypeScale.current)

    Surface(
        shape = Recipes.Badge.radius,
        color = tone.surface,
        contentColor = tone.content,
        border = BorderStroke(Recipes.Badge.borderWidth, tone.border),
    ) {
        Box(
            modifier =
                Modifier.height(size.height)
                    .padding(horizontal = size.paddingX, vertical = size.paddingY),
            contentAlignment = Alignment.Center,
        ) {
            Text(
                text =
                    if (model.unlimited) PlanCardCopy.UNLIMITED
                    else UsageCopy.planLabel(model.plan),
                style = size.text,
            )
        }
    }
}

/**
 * The site's guest prompt: a lock, the reason, and the way in.
 *
 * The boxes are the page's own (`PlanScreenMetrics`): the mark, then the two
 * sentences four pixels apart, then the action sixteen below them, which is the
 * card's gap plus the page's `mt-1`. The action is full-width here because the
 * page's CTA carries `w-full` on this surface.
 */
@Composable
private fun SignedOut(modifier: Modifier, onSignIn: () -> Unit) {
    val type = LocalRoyTypeScale.current

    CardShell(modifier.testTag(PlanScreenMetrics.CARD)) {
        Column(
            modifier = Modifier.fillMaxWidth(),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Box(
                modifier =
                    Modifier.testTag(PlanScreenMetrics.MARK)
                        .size(PlanScreenMetrics.markSize)
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
                    imageVector = LucideVectors.Lock,
                    contentDescription = null,
                    tint = Recipes.GuestMark.content,
                    modifier = Modifier.size(Recipes.Glyph.md),
                )
            }

            Spacer(Modifier.height(PlanScreenMetrics.cardGap))

            Column(
                modifier = Modifier.fillMaxWidth(),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(PlanScreenMetrics.textGap),
            ) {
                Text(
                    text = PlanCardCopy.SIGN_IN_TITLE,
                    modifier =
                        Modifier.testTag(PlanScreenMetrics.SIGN_IN_TITLE)
                            .height(PlanScreenMetrics.signInTitleHeight),
                    fontSize = PlanScreenMetrics.signInTitleSize,
                    lineHeight = PlanScreenMetrics.signInTitleLineHeight,
                    fontWeight = PlanScreenMetrics.signInTitleWeight,
                    color = MaterialTheme.colorScheme.onSurface,
                    textAlign = TextAlign.Center,
                )
                Text(
                    text = PlanCardCopy.SIGN_IN_BODY,
                    modifier =
                        Modifier.testTag(PlanScreenMetrics.SIGN_IN_BODY)
                            .height(PlanScreenMetrics.signInBodyHeight),
                    fontSize = PlanScreenMetrics.signInBodySize,
                    lineHeight = PlanScreenMetrics.signInBodyLineHeight,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    textAlign = TextAlign.Center,
                )
            }

            Spacer(Modifier.height(PlanScreenMetrics.ctaToText))

            Box(
                modifier =
                    Modifier.testTag(PlanScreenMetrics.CTA)
                        .fillMaxWidth()
                        .height(Recipes.Cta.height)
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
                    text = PlanCardCopy.SIGN_IN,
                    style = Recipes.Cta.text(type),
                    color = Recipes.Cta.content,
                )
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
