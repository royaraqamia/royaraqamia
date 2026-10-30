package com.royaraqamia.app.plans

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedCard
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextDirection
import androidx.compose.ui.unit.dp
import com.royaraqamia.app.theme.LocalRoySpacing
import com.royaraqamia.app.theme.LocalRoyTypeScale

/**
 * The plan card (#647, #648): the section the site's `/account/plan` opens with,
 * drawn from [UsageUiState] with no network of its own.
 *
 * It is a card rather than a screen on purpose. `docs/mobile/screens.json` records
 * one screen per *surface*, and `account-server` is four routes; claiming it for a
 * card would put "drawn natively" beside a surface that still has three web pages.
 * The card is the piece the account screen will be made of, and the inventory stays
 * true until that screen exists.
 *
 * The numbers are the part worth reading: every count is a run of ASCII digits and
 * separators in [com.royaraqamia.app.theme.RoyFonts.digits], which is the site's
 * `--font-digits` face, while its label stays in the UI face. Nothing here formats
 * with the device locale — [UsageCopy.count] is fixed to `en-US` for that reason.
 */
@Composable
fun PlanCard(state: UsageUiState, onRetry: () -> Unit, modifier: Modifier = Modifier) {
    when (state) {
        UsageUiState.Loading -> CardShell(modifier) { Loading() }
        is UsageUiState.Ready -> CardShell(modifier) { Counters(state.model) }
        UsageUiState.SignedOut ->
            CardShell(modifier) {
                Message(title = UsageCopy.SIGNED_OUT, body = UsageCopy.SIGNED_OUT_BODY)
            }
        is UsageUiState.Failed ->
            CardShell(modifier) { Message(title = state.message, action = onRetry) }
    }
}

@Composable
private fun CardShell(modifier: Modifier, content: @Composable ColumnScope.() -> Unit) {
    val spacing = LocalRoySpacing.current

    OutlinedCard(modifier = modifier.fillMaxWidth()) {
        Column(
            modifier = Modifier.padding(spacing.cardPadding),
            verticalArrangement = Arrangement.spacedBy(spacing.elementGap),
            content = content,
        )
    }
}

@Composable
private fun Loading() {
    Row(
        modifier = Modifier.fillMaxWidth().padding(vertical = LocalRoySpacing.current.elementGap),
        horizontalArrangement = Arrangement.Center,
    ) {
        CircularProgressIndicator(modifier = Modifier.size(24.dp), strokeWidth = 2.dp)
    }
}

@Composable
private fun Counters(model: UsageScreenModel) {
    val type = LocalRoyTypeScale.current
    val spacing = LocalRoySpacing.current

    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            text = UsageCopy.TITLE,
            style = type.body.copy(fontWeight = FontWeight.Bold),
            color = MaterialTheme.colorScheme.onSurface,
        )
        Badge(if (model.unlimited) UsageCopy.UNLIMITED else UsageCopy.planLabel(model.plan))
    }

    Column(verticalArrangement = Arrangement.spacedBy(spacing.elementGapSm)) {
        for (counter in model.counters) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    text = counter.label,
                    style = type.small,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Text(
                    text =
                        if (model.unlimited) UsageCopy.UNLIMITED
                        else "${UsageCopy.count(counter.used)} / ${UsageCopy.count(counter.cap)}",
                    // A count never reads right-to-left, whatever the screen's
                    // direction is: `1,200 / 5,000` in an RTL paragraph would put
                    // the cap first.
                    style = type.digits(type.small).copy(textDirection = TextDirection.Ltr),
                    color = MaterialTheme.colorScheme.onSurface,
                )
            }
        }
    }
}

@Composable
private fun Badge(label: String) {
    Surface(
        shape = MaterialTheme.shapes.small,
        color = MaterialTheme.colorScheme.secondaryContainer,
        contentColor = MaterialTheme.colorScheme.onSecondaryContainer,
    ) {
        Text(
            text = label,
            style = LocalRoyTypeScale.current.xs,
            modifier = Modifier.padding(horizontal = 8.dp, vertical = 2.dp),
        )
    }
}

@Composable
private fun Message(title: String, body: String? = null, action: (() -> Unit)? = null) {
    val type = LocalRoyTypeScale.current

    Column(verticalArrangement = Arrangement.spacedBy(LocalRoySpacing.current.elementGapSm)) {
        Text(
            text = title,
            style = type.body.copy(fontWeight = FontWeight.Bold),
            color = MaterialTheme.colorScheme.onSurface,
        )
        if (body != null) {
            Text(text = body, style = type.small, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        if (action != null) {
            TextButton(onClick = action) { Text(text = UsageCopy.RETRY, style = type.small) }
        }
    }
}
