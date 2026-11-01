package com.royaraqamia.app.sync

import androidx.compose.foundation.clickable
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
 * The named state the HabitFlow list shows about the server (#649, #650), ported
 * from `frontend/ui/shared/sync-status-pill.tsx`.
 *
 * The site draws a pill with an icon and a count; the app draws the same glyph,
 * sentences and counts, in the same precedence, so "offline", "waiting", "a failed
 * pull" and "a write the server refused" are four different things on both clients
 * rather than one grey bar. [onRetry] makes the failed state actionable — the
 * site's pill is a button in exactly that state, and a failure a user cannot act
 * on is a dead end.
 *
 * Precedence is the site's: failed first (a write that will not go), then
 * offline, then a failed pull, then syncing, then pending.
 */
@Composable
fun SyncPill(
    state: SyncPillState,
    modifier: Modifier = Modifier,
    onRetry: (() -> Unit)? = null,
) {
    // The glyph the site pairs with each sentence: a cloud off, a warning, a spinner.
    val glyph =
        when (state) {
            is SyncPillState.Offline -> LucideVectors.CloudOff
            SyncPillState.RefreshFailed -> LucideVectors.TriangleAlert
            SyncPillState.Syncing -> LucideVectors.RefreshCw
            is SyncPillState.Pending -> LucideVectors.RefreshCw
            is SyncPillState.Failed -> LucideVectors.TriangleAlert
        }
    val label =
        when (state) {
            is SyncPillState.Offline -> SyncPillCopy.OFFLINE
            SyncPillState.RefreshFailed -> SyncPillCopy.REFRESH_FAILED
            SyncPillState.Syncing -> SyncPillCopy.SYNCING
            is SyncPillState.Pending -> fill(SyncPillCopy.PENDING, state.count)
            is SyncPillState.Failed -> fill(SyncPillCopy.FAILED, state.count)
        }
    val pendingLabel =
        (state as? SyncPillState.Offline)
            ?.takeIf { it.pending > 0 }
            ?.let { fill(SyncPillCopy.OFFLINE_PENDING, it.pending) }

    val clickable = if (state is SyncPillState.Failed && onRetry != null) {
        Modifier.clickable(onClickLabel = SyncPillCopy.RETRY_FAILED, onClick = onRetry)
    } else {
        Modifier
    }

    Surface(
        modifier = modifier.then(clickable),
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
            pendingLabel?.let {
                Text(
                    text = it,
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(start = 6.dp),
                )
            }
        }
    }
}

/** `{count}` is a number the client substitutes, the same placeholder the site fills. */
private fun fill(sentence: String, count: Int): String = sentence.replace("{count}", count.toString())
