package com.royaraqamia.app.habitflow

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Checkbox
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import com.royaraqamia.app.contracts.ApiResult
import com.royaraqamia.app.net.Connectivity
import com.royaraqamia.app.store.habitflow.HabitRow
import com.royaraqamia.app.store.habitflow.HabitflowRepository
import com.royaraqamia.app.sync.SyncPill
import com.royaraqamia.app.sync.SyncPillState
import com.royaraqamia.app.ui.vectors.LucideVectors
import kotlinx.coroutines.launch

/**
 * HabitFlow's list, painted from the device (#649), with its writes (#650).
 *
 * The order of the reads is the ticket. [HabitflowRepository.rows] answers from
 * the database and is awaited *first*, so the frame after the shell's is the rows
 * the last pull wrote — a cold launch with the radio off paints from here. The
 * drain and the pull run beside it and never in front of it: a failure is a
 * [SyncPillState], not an empty list.
 *
 * A tap writes. The checkbox commits the row **and** its replay intent in one
 * transaction, so what the user sees happen has already survived the process
 * before the request is even attempted; the network is the next step, not the
 * condition. The queue drains when the radio returns, not only when this screen
 * is open ([com.royaraqamia.app.shell.ShellActivity] also drains at launch and on
 * reconnection).
 *
 * A `LazyColumn` rather than a `Column`: 500 rows have to scroll inside the frame
 * budget, which means only the visible ones are composed.
 */
@Composable
fun HabitflowScreen(repository: HabitflowRepository, modifier: Modifier = Modifier) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var state by remember { mutableStateOf<HabitflowUiState>(HabitflowUiState.Empty) }
    var done by remember { mutableStateOf(emptySet<String>()) }
    var pill by remember { mutableStateOf<SyncPillState?>(null) }

    /** Repaint from the store alone: no network, no session, no wait. */
    suspend fun paint() {
        state = HabitflowUiState.of(repository.rows())
        done = repository.logsToday().filterValues { it.completed }.keys
    }

    /**
     * The delivery half: drain what is queued, then pull what is new.
     *
     * A radio that is off is not a failed sync — it is the pill's Offline state,
     * and the queued count comes from the queue itself rather than from a guess.
     * The precedence of what the pill shows matches the site's
     * (`frontend/ui/shared/sync-status-pill.tsx`).
     */
    suspend fun sync() {
        paint()
        if (!Connectivity.isOnline(context)) {
            pill = SyncPillState.Offline(repository.outboxStatus().pending)
            return
        }
        pill = SyncPillState.Syncing
        val report = repository.drain()
        val pulled = repository.pull()
        paint()
        pill =
            when {
                report.failed > 0 -> SyncPillState.Failed(report.failed)
                pulled is ApiResult.Failure -> SyncPillState.RefreshFailed
                report.pending > 0 -> SyncPillState.Pending(report.pending)
                else -> null
            }
    }

    LaunchedEffect(repository) { sync() }

    // The radio returning is the trigger "a queued write drains", so this screen
    // hears it too rather than waiting for a recomposition that may never come.
    DisposableEffect(repository) {
        val watch =
            Connectivity.watch(context) {
                scope.launch { sync() }
            }
        onDispose { watch.close() }
    }

    Column(modifier = modifier.fillMaxSize().padding(horizontal = 16.dp, vertical = 12.dp)) {
        Text(
            text = HabitflowCopy.LIST_TITLE,
            style = MaterialTheme.typography.headlineSmall,
            color = MaterialTheme.colorScheme.onSurface,
        )

        pill?.let {
            Column(Modifier.padding(top = 8.dp)) {
                SyncPill(
                    state = it,
                    onRetry = {
                        scope.launch {
                            repository.retryFailed()
                            sync()
                        }
                    },
                )
            }
        }

        when (val current = state) {
            is HabitflowUiState.Painted ->
                LazyColumn(
                    modifier = Modifier.fillMaxWidth().padding(top = 12.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    items(current.rows, key = { row -> row.id }) { row ->
                        HabitflowRowView(
                            row = row,
                            completed = done.contains(row.id),
                            onToggle = {
                                scope.launch {
                                    repository.toggleLog(
                                        habitId = row.id,
                                        date = repository.today(),
                                        completed = !done.contains(row.id),
                                    )
                                    // The write is on disk before this paints, so
                                    // the checkbox never shows a state the store
                                    // does not hold.
                                    paint()
                                    sync()
                                }
                            },
                        )
                    }
                }
            HabitflowUiState.Empty ->
                Column(Modifier.padding(top = 24.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Icon(imageVector = LucideVectors.ListChecks, contentDescription = null)
                    Text(
                        text = HabitflowCopy.EMPTY_TITLE,
                        style = MaterialTheme.typography.titleMedium,
                    )
                    Text(
                        text = HabitflowCopy.EMPTY_BODY,
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
        }
    }
}

/** One row: the habit's name and today's state, which is the control that writes. */
@Composable
private fun HabitflowRowView(row: HabitRow, completed: Boolean, onToggle: () -> Unit) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Checkbox(checked = completed, onCheckedChange = { onToggle() })
        Text(
            text = row.name,
            style = MaterialTheme.typography.bodyLarge,
            color = MaterialTheme.colorScheme.onSurface,
        )
    }
}
