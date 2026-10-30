package com.royaraqamia.app.plans

import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Canvas
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
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextDirection
import androidx.compose.ui.unit.dp
import com.royaraqamia.app.theme.LocalRoySpacing
import com.royaraqamia.app.theme.LocalRoyTypeScale
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
        shape = RoyShape.card,
        colors = CardDefaults.cardColors(containerColor = RoyColors.card.copy(alpha = 0.6f)),
        border = BorderStroke(1.dp, RoyColors.border.copy(alpha = 0.5f)),
    ) {
        Column(
            modifier = Modifier.padding(spacing.cardPadding),
            verticalArrangement = Arrangement.spacedBy(spacing.elementGapSm),
            content = content,
        )
    }
}

/**
 * The site's loading state: two radius-`2xl` blocks, `bg-muted/40`, that pulse —
 * the page-level skeleton it draws instead of the card (ADR-0098).
 */
@Composable
private fun Skeleton(modifier: Modifier) {
    val spacing = LocalRoySpacing.current
    val transition = rememberInfiniteTransition(label = "plan-card-skeleton")
    val alpha by
        transition.animateFloat(
            initialValue = 1f,
            targetValue = 0.4f,
            animationSpec = infiniteRepeatable(tween(1000), RepeatMode.Reverse),
            label = "plan-card-skeleton-alpha",
        )

    Column(
        modifier =
            modifier.fillMaxWidth().semantics {
                // The site labels the skeleton with the same sentence, so a screen
                // reader announces the card's state rather than two empty boxes.
                contentDescription = PlanCardCopy.LOADING_LABEL
            },
        verticalArrangement = Arrangement.spacedBy(spacing.elementGapSm),
    ) {
        for (height in listOf(128.dp, 80.dp)) {
            Box(
                modifier =
                    Modifier.fillMaxWidth()
                        .height(height)
                        .clip(RoyShape.card)
                        .background(RoyColors.muted.copy(alpha = 0.4f * alpha))
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

    Column(verticalArrangement = Arrangement.spacedBy(spacing.elementGapSm / 2f)) {
        for (row in model.rows) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(spacing.elementGapSm),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    modifier = Modifier.weight(1f),
                    text = row.label,
                    style = type.xs,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Text(
                    text =
                        if (model.unlimited) PlanCardCopy.UNLIMITED
                        else "${UsageCopy.count(row.used)} / ${UsageCopy.count(row.cap)}",
                    // A count never reads right-to-left, whatever the screen's
                    // direction is: `1,200 / 5,000` in an RTL paragraph would put
                    // the cap first.
                    style = type.digits(type.xs).copy(textDirection = TextDirection.Ltr),
                    color = MaterialTheme.colorScheme.onSurface,
                )
            }
        }
    }

    if (model.plan == "pro" && model.expiresAt != null) {
        Text(
            text = UsageCopy.expires(PlanDates.label(model.expiresAt)),
            style = type.xs,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
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
                LockGlyph()
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
                Text(text = PlanCardCopy.RETRY, style = type.small)
            }
        }
    }
}

/**
 * The site's `Lock` icon, drawn rather than imported.
 *
 * The app carries no icon library (material3's Compose stack is the only UI
 * dependency, `build.gradle`), and the site's three icons here are decorative
 * (`aria-hidden`), so the two that carry meaning - the padlock on the guest
 * prompt - is drawn as a path instead of adding a megabyte of glyphs for it.
 */
@Composable
private fun LockGlyph() {
    val color = MaterialTheme.colorScheme.onSurfaceVariant
    Canvas(modifier = Modifier.size(24.dp)) {
        val stroke = 1.8.dp.toPx()
        val bodyWidth = size.width * 0.52f
        val bodyHeight = size.height * 0.38f
        val bodyTop = size.height * 0.46f
        drawRoundRect(
            color = color,
            topLeft = Offset((size.width - bodyWidth) / 2f, bodyTop),
            size = Size(bodyWidth, bodyHeight),
            cornerRadius = CornerRadius(size.width * 0.08f),
            style = Stroke(width = stroke),
        )
        drawArc(
            color = color,
            startAngle = 180f,
            sweepAngle = 180f,
            useCenter = false,
            topLeft = Offset(size.width * 0.32f, size.height * 0.24f),
            size = Size(size.width * 0.36f, size.height * 0.34f),
            style = Stroke(width = stroke),
        )
    }
}
