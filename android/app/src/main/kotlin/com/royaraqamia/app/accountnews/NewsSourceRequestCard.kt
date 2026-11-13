package com.royaraqamia.app.accountnews

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextDirection
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.royaraqamia.app.theme.LocalRoySpacing
import com.royaraqamia.app.theme.LocalRoyTypeScale
import com.royaraqamia.app.theme.Recipes
import com.royaraqamia.app.theme.RoyColors
import com.royaraqamia.app.ui.vectors.LucideVectors

/**
 * The site's source-proposal field (#950, ADR-0098).
 *
 * The second client of `frontend/ui/account/news-source-request.tsx`. The field
 * takes any link; a refusal keeps what was typed and shows the server's
 * sentence, and a success clears it. What became of the link is not drawn here
 * any more: the one list beside the field carries every state, so a row is
 * described in one place (ADR-0130).
 */
@Composable
fun NewsSourceRequestCard(
    state: NewsSourceRequestUiState,
    url: String,
    onUrlChange: (String) -> Unit,
    onSubmit: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val spacing = LocalRoySpacing.current
    val type = LocalRoyTypeScale.current
    val submitting = state is NewsSourceRequestUiState.Submitting
    // The page's CTA is always the gradient; only the browser's `required`
    // stops an empty submit, so the app keeps the colour and guards the tap.
    val canSubmit = !submitting && url.isNotBlank()

    Column(
        modifier = modifier.fillMaxWidth().testTag(AccountNewsMetrics.REQUEST),
    ) {
        Text(
            text = AccountNewsRequestCopy.TITLE,
            modifier = Modifier.height(AccountNewsMetrics.requestTitleHeight),
            style =
                TextStyle(
                    fontSize = AccountNewsMetrics.requestTitleSize,
                    lineHeight = AccountNewsMetrics.requestTitleLineHeight,
                    fontWeight = FontWeight.Bold,
                ),
            color = MaterialTheme.colorScheme.onSurface,
        )

        Spacer(Modifier.height(AccountNewsMetrics.requestTitleToForm))

        Text(
            text = AccountNewsRequestCopy.URL_LABEL,
            modifier = Modifier.height(AccountNewsMetrics.requestLabelHeight),
            style =
                TextStyle(
                    fontSize = AccountNewsMetrics.requestLabelSize,
                    lineHeight = AccountNewsMetrics.requestLabelLineHeight,
                    fontWeight = FontWeight.Bold,
                ),
            color = MaterialTheme.colorScheme.onSurface,
        )

        Spacer(Modifier.height(AccountNewsMetrics.requestLabelToField))

        CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Ltr) {
            Box(
                modifier =
                    Modifier
                        .fillMaxWidth()
                        .height(AccountNewsMetrics.requestFieldHeight)
                        .clip(RoundedCornerShape(AccountNewsMetrics.requestFieldRadius))
                        .background(MaterialTheme.colorScheme.background.copy(alpha = 0.8f))
                        .border(
                            1.dp,
                            MaterialTheme.colorScheme.outline.copy(alpha = 0.8f),
                            RoundedCornerShape(AccountNewsMetrics.requestFieldRadius),
                        )
                        .padding(horizontal = AccountNewsMetrics.requestFieldPaddingHorizontal),
                contentAlignment = Alignment.CenterStart,
            ) {
                if (url.isEmpty()) {
                    Text(
                        text = AccountNewsRequestCopy.URL_PLACEHOLDER,
                        style =
                            TextStyle(
                                fontSize = AccountNewsMetrics.requestValueSize,
                                lineHeight = AccountNewsMetrics.requestValueLineHeight,
                                textDirection = TextDirection.Ltr,
                            ),
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                BasicTextField(
                    value = url,
                    onValueChange = onUrlChange,
                    singleLine = true,
                    textStyle =
                        TextStyle(
                            fontSize = AccountNewsMetrics.requestValueSize,
                            lineHeight = AccountNewsMetrics.requestValueLineHeight,
                            color = MaterialTheme.colorScheme.onSurface,
                            textDirection = TextDirection.Ltr,
                        ),
                    cursorBrush = SolidColor(MaterialTheme.colorScheme.primary),
                    modifier = Modifier.fillMaxWidth(),
                )
            }
        }

        Spacer(Modifier.height(AccountNewsMetrics.requestFormToButton))

        when (state) {
            is NewsSourceRequestUiState.Failed -> {
                Feedback(
                    text = state.message.ifBlank { AccountNewsRequestCopy.SEND_FAILED },
                    destructive = true,
                )
                Spacer(Modifier.height(AccountNewsMetrics.requestFormToButton))
            }
            NewsSourceRequestUiState.Submitted -> {
                Feedback(text = AccountNewsRequestCopy.RECEIVED, destructive = false)
                Spacer(Modifier.height(AccountNewsMetrics.requestFormToButton))
            }
            else -> Unit
        }

        Box(
            modifier =
                Modifier.height(AccountNewsMetrics.requestButtonHeight)
                    .shadow(
                        elevation = Recipes.Cta.bloomY,
                        shape = Recipes.Cta.radius,
                        ambientColor = Recipes.Cta.bloom,
                        spotColor = Recipes.Cta.bloom,
                    )
                    .clip(Recipes.Cta.radius)
                    .background(
                        if (submitting) {
                            Brush.horizontalGradient(listOf(RoyColors.muted, RoyColors.muted))
                        } else {
                            Brush.horizontalGradient(Recipes.Cta.stops)
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
    }
}

@Composable
private fun Feedback(text: String, destructive: Boolean) {
    val tone = if (destructive) RoyColors.destructive else RoyColors.success

    Row(
        modifier =
            Modifier.fillMaxWidth()
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
