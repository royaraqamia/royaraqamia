package com.royaraqamia.app.account

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.royaraqamia.app.theme.LocalRoySpacing
import com.royaraqamia.app.theme.LocalRoyTypeScale
import com.royaraqamia.app.theme.Recipes
import com.royaraqamia.app.theme.RoyColors
import com.royaraqamia.app.ui.vectors.LucideVectors

/** The boxes and links the card's tests press, named once (#947). */
object AccountUsageTags {
    const val CARD = "account-usage-card"
    const val LOADING = "account-usage-loading"
    const val DETAILS = "account-usage-details"
    const val UPGRADE = "account-usage-upgrade"
    const val RETRY = "account-usage-retry"
}

/**
 * The account page's allowance card (#947), ported from
 * `frontend/ui/account/usage-card.tsx`.
 *
 * The page's card states which plan is in force and the two ways to act on it:
 * the details and history on `/account/plan`, and — for a free member — the
 * upgrade on `/pricing`. A visitor gets no card at all, and a read that cannot be
 * trusted says so with a retry instead of drawing an empty badge.
 *
 * The words are [AccountUsageCopy], generated from
 * `shared/copy/account-usage.json`; nothing user-facing is retyped here. The four
 * faces are [AccountUsageUiState], which `docs/mobile/parity.json` holds against
 * the page's, so a state on one client only fails `npm run check:parity`
 * (ADR-0098).
 */
@Composable
fun AccountUsageCard(
    state: AccountUsageUiState,
    onOpenRoute: (String) -> Unit,
    onRetry: () -> Unit,
    modifier: Modifier = Modifier,
) {
    if (state is AccountUsageUiState.Hidden) return

    val spacing = LocalRoySpacing.current

    Column(
        modifier =
            modifier
                .fillMaxWidth()
                .clip(Recipes.Card.radius)
                .background(Recipes.Card.container)
                .border(Recipes.Card.border, Recipes.Card.radius)
                .padding(Recipes.Card.padding(spacing))
                .semantics { contentDescription = AccountUsageCopy.ARIA_LABEL }
                .testTag(AccountUsageTags.CARD),
        verticalArrangement = Arrangement.spacedBy(spacing.elementGapSm),
    ) {
        Header(state)

        when (state) {
            AccountUsageUiState.Loading, AccountUsageUiState.Hidden -> Unit
            is AccountUsageUiState.Ready -> Links(state, onOpenRoute)
            AccountUsageUiState.Failed -> Failure(onRetry)
        }
    }
}

/** The page's header: the wallet, the card's name, and the plan or its skeleton. */
@Composable
private fun Header(state: AccountUsageUiState) {
    val type = LocalRoyTypeScale.current
    val spacing = LocalRoySpacing.current

    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(spacing.elementGapSm),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Row(
            modifier = Modifier.weight(1f),
            horizontalArrangement = Arrangement.spacedBy(10.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(
                imageVector = LucideVectors.Wallet,
                contentDescription = null,
                tint = RoyColors.primary,
                modifier = Modifier.size(Recipes.Glyph.sm),
            )
            Text(
                text = AccountUsageCopy.TITLE,
                style = type.small.copy(fontWeight = FontWeight.Bold),
                color = RoyColors.foreground,
            )
        }

        when (state) {
            is AccountUsageUiState.Ready -> PlanBadge(state)
            AccountUsageUiState.Loading -> LoadingPill()
            AccountUsageUiState.Failed, AccountUsageUiState.Hidden -> Unit
        }
    }
}

/** The site's skeleton pill while the read is out. */
@Composable
private fun LoadingPill() {
    Box(
        modifier =
            Modifier.testTag(AccountUsageTags.LOADING)
                .height(20.dp)
                .width(80.dp)
                .clip(RoundedCornerShape(50))
                .background(RoyColors.muted.copy(alpha = 0.6f))
                // The site labels the same pill, so a screen reader announces the
                // card's state rather than an empty box.
                .semantics { contentDescription = AccountUsageCopy.LOADING },
    )
}

/** The site's badge: a pill tinted by the plan, green when the plan is unlimited or paid. */
@Composable
private fun PlanBadge(state: AccountUsageUiState.Ready) {
    val tone = if (state.unlimited || state.plan == "pro") Recipes.Badge.success else Recipes.Badge.neutral
    val size = Recipes.Badge.default(LocalRoyTypeScale.current)

    Surface(
        shape = Recipes.Badge.radius,
        color = tone.surface,
        contentColor = tone.content,
        border = BorderStroke(Recipes.Badge.borderWidth, tone.border),
    ) {
        Box(
            modifier = Modifier.height(size.height).padding(horizontal = size.paddingX, vertical = size.paddingY),
            contentAlignment = Alignment.Center,
        ) {
            Text(
                text = if (state.unlimited) AccountUsageCopy.UNLIMITED else planLabel(state.plan),
                style = size.text,
            )
        }
    }
}

/** The plan's label in the page's words; an unknown id is shown as it came rather than blanked. */
private fun planLabel(plan: String): String =
    when (plan) {
        "free" -> AccountUsageCopy.PLAN_FREE
        "pro" -> AccountUsageCopy.PLAN_PRO
        else -> plan
    }

/**
 * The two ways to act on the card, wrapping like the page's `flex-wrap`: the
 * details always, the upgrade only while the member is on the free plan.
 */
@Composable
private fun Links(state: AccountUsageUiState.Ready, onOpenRoute: (String) -> Unit) {
    FlowRow(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(16.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
        itemVerticalAlignment = Alignment.CenterVertically,
    ) {
        UsageLink(
            label = AccountUsageCopy.DETAILS,
            glyph = LucideVectors.ArrowLeft,
            glyphAtEnd = true,
            tag = AccountUsageTags.DETAILS,
            onClick = { onOpenRoute("/account/plan") },
        )
        if (state.plan == "free" && !state.unlimited) {
            UsageLink(
                label = AccountUsageCopy.UPGRADE,
                glyph = LucideVectors.Sparkles,
                glyphAtEnd = false,
                tag = AccountUsageTags.UPGRADE,
                onClick = { onOpenRoute("/pricing") },
            )
        }
    }
}

/** One text link: its words and the glyph on the side the page draws it. */
@Composable
private fun UsageLink(
    label: String,
    glyph: ImageVector,
    glyphAtEnd: Boolean,
    tag: String,
    onClick: () -> Unit,
) {
    val type = LocalRoyTypeScale.current

    Row(
        modifier = Modifier.testTag(tag).clickable(onClick = onClick),
        horizontalArrangement = Arrangement.spacedBy(6.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (!glyphAtEnd) {
            Icon(
                imageVector = glyph,
                contentDescription = null,
                tint = RoyColors.primary,
                modifier = Modifier.size(14.dp),
            )
        }
        Text(
            text = label,
            style = type.xs.copy(fontWeight = FontWeight.Bold),
            color = RoyColors.primary,
        )
        if (glyphAtEnd) {
            Icon(
                imageVector = glyph,
                contentDescription = null,
                tint = RoyColors.primary,
                modifier = Modifier.size(14.dp),
            )
        }
    }
}

/** The page's failed read: its sentence and its retry, never an empty card. */
@Composable
private fun Failure(onRetry: () -> Unit) {
    val type = LocalRoyTypeScale.current

    FlowRow(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(4.dp),
        verticalArrangement = Arrangement.spacedBy(4.dp),
        itemVerticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            text = AccountUsageCopy.FAILED,
            style = type.xs,
            color = RoyColors.mutedForeground,
        )
        Text(
            text = AccountUsageCopy.RETRY,
            modifier = Modifier.testTag(AccountUsageTags.RETRY).clickable(onClick = onRetry),
            style = type.xs.copy(fontWeight = FontWeight.Bold),
            color = RoyColors.primary,
        )
    }
}
