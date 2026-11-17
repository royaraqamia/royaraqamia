package com.royaraqamia.app.scan

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.royaraqamia.app.theme.LocalRoySpacing
import com.royaraqamia.app.theme.LocalRoyTypeScale
import com.royaraqamia.app.theme.Recipes
import com.royaraqamia.app.theme.RoyColors
import com.royaraqamia.app.theme.RoyTypeScale

/**
 * The Scanner's history (#1430, ADR-0205). The page's section is
 * `frontend/ui/scan/scan-history.tsx`, and both draw the same words from
 * `shared/copy/scan-history.json`.
 *
 * Below the card rather than inside it: the card is a measured box in the visual
 * contract, and a list that grows would move a height the gate records. The pair
 * for this block is enforced by its parity row and the one copy source, not by a
 * pixel baseline yet - it sits outside the recorded region, and a baseline for it
 * is the next visual slice.
 *
 * Its state is passed in, so the drawing can be composed from a fixture.
 */
internal object ScanHistoryMetrics {
    const val SECTION = "scan-history"
    const val TITLE = "scan-history-title"
    const val CARD = "scan-history-card"
    const val ROW = "scan-history-row"
    const val CLEAR = "scan-history-clear"
    const val CLEAR_CONFIRM = "scan-history-clear-confirm"
    const val RETRY = "scan-history-retry"
}

@Composable
internal fun ScanHistorySection(
    state: ScanHistoryUiState,
    onRetry: () -> Unit,
    onAskClear: () -> Unit,
    onClear: () -> Unit,
    onCancel: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val spacing = LocalRoySpacing.current
    val type = LocalRoyTypeScale.current
    val rows = (state as? ScanHistoryUiState.Ready)?.entries.orEmpty()
    val confirming = (state as? ScanHistoryUiState.Ready)?.confirming == true

    Column(
        modifier = modifier.fillMaxWidth().testTag(ScanHistoryMetrics.SECTION),
        verticalArrangement = Arrangement.spacedBy(spacing.elementGap),
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween,
        ) {
            Text(
                text = ScanHistoryCopy.TITLE,
                style = type.body.copy(fontWeight = FontWeight.Bold),
                color = RoyColors.foreground,
                modifier = Modifier.testTag(ScanHistoryMetrics.TITLE).semantics { heading() },
            )

            if (rows.isNotEmpty() && !confirming) {
                TextButton(
                    onClick = onAskClear,
                    modifier = Modifier.testTag(ScanHistoryMetrics.CLEAR),
                ) {
                    Text(text = ScanHistoryCopy.CLEAR, style = type.small)
                }
            }
        }

        when (state) {
            // The heading is already drawn above, which is the whole of this
            // state's drawing.
            ScanHistoryUiState.Loading -> Unit

            ScanHistoryUiState.SignedOut ->
                Text(
                    text = ScanHistoryCopy.SIGNED_OUT,
                    style = type.small,
                    color = RoyColors.mutedForeground,
                )

            is ScanHistoryUiState.Empty ->
                Text(
                    text = state.notice ?: ScanHistoryCopy.EMPTY,
                    style = type.small,
                    color = RoyColors.mutedForeground,
                )

            ScanHistoryUiState.Failed ->
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(spacing.elementGap),
                ) {
                    Text(
                        text = ScanHistoryCopy.FAILED,
                        style = type.small,
                        color = RoyColors.destructive,
                    )
                    OutlinedButton(
                        onClick = onRetry,
                        shape = Recipes.Card.radius,
                        modifier = Modifier.testTag(ScanHistoryMetrics.RETRY),
                    ) {
                        Text(text = ScanHistoryCopy.RETRY, style = type.small)
                    }
                }

            is ScanHistoryUiState.Ready ->
                Card(
                    modifier = Modifier.fillMaxWidth().testTag(ScanHistoryMetrics.CARD),
                    shape = Recipes.Card.radius,
                    colors = CardDefaults.cardColors(containerColor = Recipes.Card.container),
                    border = Recipes.Card.border,
                ) {
                    Column(modifier = Modifier.fillMaxWidth().padding(spacing.elementGap)) {
                        state.entries.forEachIndexed { index, entry ->
                            if (index > 0) {
                                HorizontalDivider(color = RoyColors.border.copy(alpha = 0.4f))
                            }
                            ScanHistoryRow(entry = entry, type = type)
                        }
                    }
                }
        }

        if (confirming) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(spacing.elementGap),
            ) {
                Text(
                    text = ScanHistoryCopy.CLEAR_QUESTION,
                    style = type.small,
                    color = RoyColors.destructive,
                )
                OutlinedButton(
                    onClick = onClear,
                    shape = Recipes.Card.radius,
                    modifier = Modifier.testTag(ScanHistoryMetrics.CLEAR_CONFIRM),
                ) {
                    Text(text = ScanHistoryCopy.CLEAR_CONFIRM, style = type.small)
                }
                TextButton(onClick = onCancel) {
                    Text(text = ScanHistoryCopy.CANCEL, style = type.small)
                }
            }
        }
    }
}

@Composable
private fun ScanHistoryRow(entry: ScanHistoryEntry, type: RoyTypeScale) {
    val name = entry.label ?: ScanClassifier.kindLabel(entry.kind)
    val seen =
        if (entry.seenCount == 1L) {
            ScanHistoryCopy.SEEN_ONCE
        } else {
            ScanHistoryCopy.SEEN_MANY.replace("{count}", entry.seenCount.toString())
        }
    val meta =
        buildString {
            if (entry.label != null) {
                append(ScanClassifier.kindLabel(entry.kind))
                append(" · ")
            }
            append(seen)
            append(" · ")
            append(ScanHistoryCopy.LAST_SEEN.replace("{date}", entry.lastSeenDate))
        }

    Column(
        modifier = Modifier.fillMaxWidth().padding(vertical = 8.dp).testTag(ScanHistoryMetrics.ROW),
        verticalArrangement = Arrangement.spacedBy(2.dp),
    ) {
        Text(
            text = name,
            style = type.small.copy(fontWeight = FontWeight.Medium),
            color = RoyColors.foreground,
        )
        Text(text = meta, style = type.xs, color = RoyColors.mutedForeground)
    }
}
