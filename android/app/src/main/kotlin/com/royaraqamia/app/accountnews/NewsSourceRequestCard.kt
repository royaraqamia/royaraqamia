package com.royaraqamia.app.accountnews

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
import androidx.compose.material3.Icon
import androidx.compose.material3.LocalTextStyle
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextDirection
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.royaraqamia.app.theme.LocalRoySpacing
import com.royaraqamia.app.theme.LocalRoyTypeScale
import com.royaraqamia.app.theme.Recipes
import com.royaraqamia.app.theme.RoyColors
import com.royaraqamia.app.ui.vectors.LucideVectors

/**
 * The site's source-proposal form and its audit list (#950, ADR-0098).
 *
 * The second client of `frontend/ui/account/news-source-request.tsx`. A refusal
 * keeps the two fields exactly as typed and shows the server's sentence, and a
 * success clears them and prepends the new row — the page's toast and list
 * update do the same. Every word comes from
 * `shared/copy/account-news-request.json`.
 */
@Composable
fun NewsSourceRequestCard(
    state: NewsSourceRequestUiState,
    url: String,
    requests: List<NewsRequest>,
    onUrlChange: (String) -> Unit,
    onSubmit: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val spacing = LocalRoySpacing.current
    val type = LocalRoyTypeScale.current
    val submitting = state is NewsSourceRequestUiState.Submitting
    val open = requests.any { it.status == "resolving" }
    val canSubmit = !submitting && url.isNotBlank()

    Column(
        modifier = modifier.fillMaxWidth().testTag("account-news-request"),
        verticalArrangement = Arrangement.spacedBy(spacing.elementGapSm),
    ) {
        Text(
            text = AccountNewsRequestCopy.TITLE,
            style = type.small.copy(fontWeight = FontWeight.Bold),
            color = MaterialTheme.colorScheme.onSurface,
        )
        if (open) {
            Text(
                text = AccountNewsRequestCopy.PENDING,
                modifier =
                    Modifier
                        .fillMaxWidth()
                        .clip(Recipes.Card.radius)
                        .background(Recipes.Card.container)
                        .border(Recipes.Card.border, Recipes.Card.radius)
                        .padding(spacing.elementGapSm),
                style = type.xs,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }

        OutlinedTextField(
            value = url,
            onValueChange = onUrlChange,
            modifier = Modifier.fillMaxWidth(),
            label = { Text(AccountNewsRequestCopy.URL_LABEL, style = type.xs) },
            placeholder = { Text(AccountNewsRequestCopy.URL_PLACEHOLDER, style = type.xs) },
            singleLine = true,
            textStyle = LocalTextStyle.current.copy(textDirection = TextDirection.Ltr),
            shape = Recipes.Card.radius,
        )

        when (state) {
            is NewsSourceRequestUiState.Failed -> Feedback(
                text = state.message.ifBlank { AccountNewsRequestCopy.SEND_FAILED },
                destructive = true,
            )
            NewsSourceRequestUiState.Submitted ->
                Feedback(text = AccountNewsRequestCopy.RECEIVED, destructive = false)
            else -> Unit
        }

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
                        if (canSubmit) {
                            Brush.horizontalGradient(Recipes.Cta.stops)
                        } else {
                            Brush.horizontalGradient(listOf(RoyColors.muted, RoyColors.muted))
                        }
                    )
                    .border(Recipes.Cta.border, Recipes.Cta.radius)
                    .clickable(enabled = canSubmit, role = Role.Button, onClick = onSubmit)
                    .padding(horizontal = Recipes.Cta.paddingX),
            contentAlignment = Alignment.Center,
        ) {
            Text(
                text =
                    if (submitting) {
                        AccountNewsRequestCopy.SUBMIT_BUSY
                    } else {
                        AccountNewsRequestCopy.SUBMIT
                    },
                style = Recipes.Cta.text(type),
                color = Recipes.Cta.content,
            )
        }

        if (requests.isNotEmpty()) {
            Column(verticalArrangement = Arrangement.spacedBy(spacing.elementGapSm)) {
                for (request in requests) {
                    RequestRow(request)
                }
            }
        }
    }
}

@Composable
private fun RequestRow(request: NewsRequest) {
    val spacing = LocalRoySpacing.current
    val type = LocalRoyTypeScale.current

    Surface(
        modifier = Modifier.fillMaxWidth(),
        shape = Recipes.Card.radius,
        color = Recipes.Card.container,
        border = Recipes.Card.border,
    ) {
        Column(
            modifier = Modifier.padding(spacing.elementGapSm),
            verticalArrangement = Arrangement.spacedBy(spacing.elementGapSm / 2f),
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    text = request.name,
                    modifier = Modifier.weight(1f),
                    style = type.small.copy(fontWeight = FontWeight.Bold),
                    color = MaterialTheme.colorScheme.onSurface,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                RequestStatusBadge(request.status)
            }

            Text(
                text = request.url,
                style = type.xs.copy(textDirection = TextDirection.Ltr),
                color = Recipes.Row.labelColor,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )

            val failure = NewsText.failureLabel(request.failure)
            if (request.status == "needs_review" && failure != null) {
                Text(
                    text = failure,
                    style = type.xs,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }

            if (request.resolvedUrl != null && request.resolvedUrl != request.url) {
                Text(
                    text = request.resolvedUrl,
                    style = type.xs.copy(textDirection = TextDirection.Ltr),
                    color = Recipes.Row.labelColor,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }

            if (request.note != null) {
                Text(
                    text = request.note,
                    style = type.xs,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}

@Composable
private fun RequestStatusBadge(status: String) {
    val type = LocalRoyTypeScale.current
    val size = Recipes.Badge.default(type)
    val tone =
        when (status) {
            "rejected" ->
                Recipes.Badge.Tone(
                    surface = RoyColors.destructive.copy(alpha = 0.1f),
                    border = RoyColors.destructive.copy(alpha = 0.3f),
                    content = RoyColors.destructive,
                )
            "approved" -> Recipes.Badge.success
            else -> Recipes.Badge.neutral
        }

    Surface(
        shape = Recipes.Badge.radius,
        color = tone.surface,
        border = BorderStroke(Recipes.Badge.borderWidth, tone.border),
    ) {
        Text(
            text = NewsText.requestStatusLabel(status),
            modifier = Modifier.padding(horizontal = size.paddingX, vertical = size.paddingY),
            style = size.text,
            color = tone.content,
        )
    }
}

@Composable
private fun Feedback(text: String, destructive: Boolean) {
    val tone = if (destructive) RoyColors.destructive else RoyColors.success

    Row(
        modifier =
            Modifier
                .fillMaxWidth()
                .clip(Recipes.Card.radius)
                .background(tone.copy(alpha = 0.05f))
                .border(BorderStroke(1.dp, tone.copy(alpha = 0.3f)), Recipes.Card.radius)
                .padding(LocalRoySpacing.current.elementGapSm),
        horizontalArrangement = Arrangement.spacedBy(LocalRoySpacing.current.elementGapSm),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(
            imageVector = if (destructive) LucideVectors.CircleAlert else LucideVectors.CircleCheck,
            contentDescription = null,
            tint = tone,
            modifier = Modifier.size(Recipes.Glyph.sm),
        )
        Text(
            text = text,
            style = LocalRoyTypeScale.current.xs,
            color = tone,
        )
    }
}
