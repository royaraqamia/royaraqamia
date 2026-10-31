package com.royaraqamia.app.sync

import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.royaraqamia.app.ui.vectors.LucideVectors

/**
 * The named state the HabitFlow list shows when a read needs the server (#649),
 * ported from `frontend/ui/shared/sync-status-pill.tsx`.
 *
 * The site draws a pill with an icon and a count; the app draws the words, because
 * the count belongs to the outbox #650 has not built and the icon set is the
 * site's to grow. What it keeps is the vocabulary: "offline" and "the pull
 * failed" are two sentences, not one grey bar.
 */
@Composable
fun SyncPill(state: SyncPillState, modifier: Modifier = Modifier) {
    // The glyph the site pairs with each sentence: a cloud off, a warning, a spinner.
    val glyph =
        when (state) {
            SyncPillState.Offline -> LucideVectors.CloudOff
            SyncPillState.RefreshFailed -> LucideVectors.TriangleAlert
            SyncPillState.Syncing -> LucideVectors.RefreshCw
        }
    val label =
        when (state) {
            SyncPillState.Offline -> SyncPillCopy.OFFLINE
            SyncPillState.RefreshFailed -> SyncPillCopy.REFRESH_FAILED
            SyncPillState.Syncing -> SyncPillCopy.SYNCING
        }

    Surface(
        modifier = modifier,
        shape = MaterialTheme.shapes.extraLarge,
        color = MaterialTheme.colorScheme.surfaceVariant,
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 12.dp, vertical = 6.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(imageVector = glyph, contentDescription = null)
            Text(
                text = label,
            style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(start = 6.dp),
            )
        }
    }
}
