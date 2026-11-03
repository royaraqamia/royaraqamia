package com.royaraqamia.app.linksnap

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.dp
import com.royaraqamia.app.ui.vectors.LucideVectors

/** The empty state's one shape: there are no links to draw yet. */
sealed interface LinksnapEmptyStateUiState {
    data object Empty : LinksnapEmptyStateUiState
}

/**
 * The site's empty state (#654), ported from
 * `frontend/ui/linksnap/dashboard-empty-state.tsx`.
 *
 * A member who owns no links sees the sentence, the description and the one
 * action the dashboard offers, in the same words and with the same glyph the
 * site draws. Everything comes from the generated copy source both clients read
 * (ADR-0098), so the two cannot spell it differently.
 */
@Composable
fun LinksnapEmptyState(
    state: LinksnapEmptyStateUiState = LinksnapEmptyStateUiState.Empty,
    modifier: Modifier = Modifier,
    onCreateFirst: () -> Unit = {},
) {
    when (state) {
        LinksnapEmptyStateUiState.Empty ->
            Surface(
                modifier = modifier.fillMaxWidth().testTag("linksnap-empty"),
                color = MaterialTheme.colorScheme.surfaceVariant,
                shape = MaterialTheme.shapes.large,
            ) {
                Column(
                    modifier = Modifier.fillMaxWidth().padding(20.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    Icon(
                        imageVector = LucideVectors.Link2,
                        contentDescription = null,
                        modifier = Modifier.size(28.dp),
                        tint = MaterialTheme.colorScheme.primary,
                    )
                    Text(
                        text = LinksnapCopy.EMPTY_TITLE,
                        style = MaterialTheme.typography.titleMedium,
                        color = MaterialTheme.colorScheme.onSurface,
                    )
                    Text(
                        text = LinksnapCopy.EMPTY_BODY,
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    TextButton(onClick = onCreateFirst) {
                        Text(text = LinksnapCopy.EMPTY_ACTION)
                    }
                }
            }
    }
}
