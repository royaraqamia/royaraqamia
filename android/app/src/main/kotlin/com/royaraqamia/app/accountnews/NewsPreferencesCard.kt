package com.royaraqamia.app.accountnews

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
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.selection.toggleable
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
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.Role
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
 * The site's source checklist (#950, ADR-0098).
 *
 * The second client of `frontend/ui/account/news-preferences.tsx`: the same four
 * states ([NewsPreferencesUiState]), the same category groups, the same
 * fully-ticked "everything" default, and the same words from `shared/copy/account-news-preferences.json`.
 *
 * The card is a rendering of the state it is given. The screen owns the read,
 * the save and the action error, exactly as the page's island does.
 */
@Composable
fun NewsPreferencesCard(
    state: NewsPreferencesUiState,
    saving: Boolean,
    actionError: String?,
    onRetry: () -> Unit,
    onSignIn: () -> Unit,
    onToggle: (String) -> Unit,
    onToggleAll: () -> Unit,
    onSave: () -> Unit,
    modifier: Modifier = Modifier,
) {
    when (state) {
        NewsPreferencesUiState.Loading -> Skeleton(modifier)
        NewsPreferencesUiState.SignedOut -> SignedOut(onSignIn, modifier)
        NewsPreferencesUiState.Failed -> Failed(onRetry, modifier)
        is NewsPreferencesUiState.Ready ->
            Ready(
                state = state,
                saving = saving,
                actionError = actionError,
                onToggle = onToggle,
                onToggleAll = onToggleAll,
                onSave = onSave,
                modifier = modifier,
            )
    }
}

@Composable
private fun Ready(
    state: NewsPreferencesUiState.Ready,
    saving: Boolean,
    actionError: String?,
    onToggle: (String) -> Unit,
    onToggleAll: () -> Unit,
    onSave: () -> Unit,
    modifier: Modifier,
) {
    val spacing = LocalRoySpacing.current
    val type = LocalRoyTypeScale.current
    val allSelected = state.sources.isNotEmpty() && state.selected.size == state.sources.size

    Column(
        modifier = modifier.fillMaxWidth(),
        verticalArrangement = Arrangement.spacedBy(spacing.elementGap),
    ) {
        if (actionError != null) Alert(actionError)

        for (category in CATEGORY_ORDER) {
            val group = state.sources.filter { it.category == category }
            if (group.isEmpty()) continue

            Column(verticalArrangement = Arrangement.spacedBy(spacing.elementGapSm)) {
                Row(
                    horizontalArrangement = Arrangement.spacedBy(spacing.elementGapSm),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Icon(
                        imageVector = LucideVectors.Newspaper,
                        contentDescription = null,
                        tint = RoyColors.primary,
                        modifier = Modifier.size(Recipes.Glyph.sm),
                    )
                    Text(
                        text = NewsText.categoryLabel(category),
                        style = type.small.copy(fontWeight = FontWeight.Bold),
                        color = MaterialTheme.colorScheme.onSurface,
                    )
                }

                for ((index, source) in group.withIndex()) {
                    SourceRow(
                        source = source,
                        checked = state.selected.contains(source.id),
                        onToggle = { onToggle(source.id) },
                        modifier =
                            if (index == 0) Modifier.testTag("account-news-source-row") else Modifier,
                    )
                }
            }
        }

        Row(
            horizontalArrangement = Arrangement.spacedBy(spacing.elementGapSm),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            PrimaryButton(
                label = if (saving) AccountNewsPreferencesCopy.SAVE_BUSY else AccountNewsPreferencesCopy.SAVE,
                onClick = onSave,
                enabled = !saving,
            )

            OutlinedButton(
                onClick = onToggleAll,
                enabled = !saving && !allSelected,
                shape = MaterialTheme.shapes.large,
            ) {
                Icon(
                    imageVector = LucideVectors.Check,
                    contentDescription = null,
                    modifier = Modifier.size(Recipes.Glyph.sm),
                )
                Text(
                    text = AccountNewsPreferencesCopy.SELECT_ALL,
                    style = type.small,
                    modifier = Modifier.padding(start = spacing.elementGapSm / 2f),
                )
            }
        }
    }
}

/** One source, ticked or not: the site's button with its `aria-pressed` state. */
@Composable
private fun SourceRow(
    source: NewsSource,
    checked: Boolean,
    onToggle: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val spacing = LocalRoySpacing.current
    val type = LocalRoyTypeScale.current

    Surface(
        modifier =
            modifier
                .fillMaxWidth()
                .toggleable(value = checked, role = Role.Checkbox, onValueChange = { onToggle() }),
        shape = Recipes.Card.radius,
        color = if (checked) RoyColors.primary.copy(alpha = 0.1f) else Recipes.Card.container,
        border =
            if (checked) {
                BorderStroke(1.dp, RoyColors.primary.copy(alpha = 0.4f))
            } else {
                Recipes.Card.border
            },
    ) {
        Row(
            modifier = Modifier.padding(horizontal = spacing.elementGap, vertical = spacing.elementGapSm),
            horizontalArrangement = Arrangement.spacedBy(spacing.elementGapSm),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = source.name,
                    style = type.small.copy(fontWeight = FontWeight.Bold),
                    color = MaterialTheme.colorScheme.onSurface,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                Text(
                    text = NewsText.regionLabel(source.region),
                    style = type.xs,
                    color = Recipes.Row.labelColor,
                )
            }

            Box(
                modifier =
                    Modifier.size(Recipes.Badge.default(type).height)
                        .clip(Recipes.Badge.radius)
                        .background(if (checked) RoyColors.primary else RoyColors.background)
                        .border(
                            Recipes.Badge.borderWidth,
                            if (checked) RoyColors.primary else RoyColors.border,
                            Recipes.Badge.radius,
                        ),
                contentAlignment = Alignment.Center,
            ) {
                if (checked) {
                    Icon(
                        imageVector = LucideVectors.Check,
                        contentDescription = null,
                        tint = RoyColors.primaryForeground,
                        modifier = Modifier.size(Recipes.Glyph.sm),
                    )
                }
            }
        }
    }
}

/** The site's `حفظ الاختيار` pill, drawn from the CTA recipe. */
@Composable
private fun PrimaryButton(label: String, onClick: () -> Unit, enabled: Boolean) {
    val type = LocalRoyTypeScale.current

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
                .background(
                    if (enabled) {
                        Brush.horizontalGradient(Recipes.Cta.stops)
                    } else {
                        Brush.horizontalGradient(
                            listOf(RoyColors.muted, RoyColors.muted)
                        )
                    }
                )
                .border(Recipes.Cta.border, Recipes.Cta.radius)
                .clickable(enabled = enabled, role = Role.Button, onClick = onClick)
                .padding(horizontal = Recipes.Cta.paddingX),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text = label,
            style = Recipes.Cta.text(type),
            color = Recipes.Cta.content,
        )
    }
}

@Composable
private fun Alert(message: String) {
    Surface(
        modifier = Modifier.fillMaxWidth(),
        shape = Recipes.Card.radius,
        color = RoyColors.destructive.copy(alpha = 0.05f),
        border = BorderStroke(Recipes.Badge.borderWidth, RoyColors.destructive.copy(alpha = 0.3f)),
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
    val transition = rememberInfiniteTransition(label = "news-preferences-skeleton")
    val alpha by
        transition.animateFloat(
            initialValue = Recipes.Skeleton.pulseFrom,
            targetValue = Recipes.Skeleton.pulseTo,
            animationSpec = infiniteRepeatable(tween(Recipes.Skeleton.pulseMs), RepeatMode.Reverse),
            label = "news-preferences-skeleton-alpha",
        )

    Column(
        modifier =
            modifier.fillMaxWidth().semantics {
                contentDescription = AccountNewsPreferencesCopy.LOADING_LABEL
            },
        verticalArrangement = Arrangement.spacedBy(Recipes.Skeleton.gap),
    ) {
        repeat(3) {
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
private fun SignedOut(onSignIn: () -> Unit, modifier: Modifier) {
    val spacing = LocalRoySpacing.current
    val type = LocalRoyTypeScale.current

    Surface(
        modifier = modifier.fillMaxWidth(),
        shape = Recipes.Card.radius,
        color = Recipes.Card.container,
        border = Recipes.Card.border,
    ) {
        Column(
            modifier = Modifier.fillMaxWidth().padding(Recipes.Card.padding(spacing)),
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
                    imageVector = LucideVectors.Lock,
                    contentDescription = null,
                    tint = Recipes.GuestMark.content,
                    modifier = Modifier.size(Recipes.Glyph.md),
                )
            }
            Text(
                text = AccountNewsPreferencesCopy.SIGN_IN_BODY,
                style = type.xs,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                textAlign = TextAlign.Center,
            )
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
                        .clickable(role = Role.Button, onClick = onSignIn)
                        .padding(horizontal = Recipes.Cta.paddingX),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    text = AccountNewsPreferencesCopy.SIGN_IN,
                    style = Recipes.Cta.text(type),
                    color = Recipes.Cta.content,
                )
            }
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
        border = BorderStroke(Recipes.Badge.borderWidth, RoyColors.destructive.copy(alpha = 0.3f)),
    ) {
        Column(
            modifier = Modifier.fillMaxWidth().padding(Recipes.Card.padding(spacing)),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(spacing.elementGapSm),
        ) {
            Text(
                text = AccountNewsPreferencesCopy.LOAD_FAILED,
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
                    text = AccountNewsPreferencesCopy.RETRY,
                    style = type.small,
                    modifier = Modifier.padding(start = spacing.elementGapSm / 2f),
                )
            }
        }
    }
}

/** The site's catalogue order. Internal keys, not the reader's words. */
private val CATEGORY_ORDER =
    listOf("tech", "politics", "religion", "economy", "world", "other")

