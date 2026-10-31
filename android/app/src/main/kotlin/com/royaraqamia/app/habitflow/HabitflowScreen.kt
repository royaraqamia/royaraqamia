package com.royaraqamia.app.habitflow

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.royaraqamia.app.contracts.ApiResult
import com.royaraqamia.app.store.habitflow.HabitRow
import com.royaraqamia.app.store.habitflow.HabitflowRepository
import com.royaraqamia.app.sync.SyncPill
import com.royaraqamia.app.sync.SyncPillState
import com.royaraqamia.app.ui.vectors.LucideVectors

/**
 * HabitFlow's list, painted from the device (#649), the pair of
 * `frontend/ui/habitflow/components/dashboard-shell.tsx`.
 *
 * The order of the two reads is the ticket. [HabitflowRepository.rows] answers from
 * the database and is awaited *first*, so the frame after the shell's is the rows
 * the last pull wrote Ã¢â‚¬â€ a cold launch with the radio off paints from here. The pull
 * runs beside it and never in front of it: its failure is a [SyncPillState], not an
 * empty list, and a successful one repaints.
 *
 * A `LazyColumn` rather than a `Column`: 500 rows have to scroll inside the frame
 * budget, which means only the visible ones are composed.
 */
@Composable
fun HabitflowScreen(repository: HabitflowRepository, modifier: Modifier = Modifier) {
    var state by remember { mutableStateOf<HabitflowUiState>(HabitflowUiState.Empty) }
    var pill by remember { mutableStateOf<SyncPillState?>(null) }

    LaunchedEffect(repository) {
        state = HabitflowUiState.of(repository.rows())
        pill = SyncPillState.Syncing
        pill =
            when (repository.pull()) {
                is ApiResult.Success -> null
                is ApiResult.Failure -> SyncPillState.RefreshFailed
            }
        val refreshed = HabitflowUiState.of(repository.rows())
        if (refreshed != state) state = refreshed
    }

    Column(modifier = modifier.fillMaxSize().padding(horizontal = 16.dp, vertical = 12.dp)) {
        Text(
            text = HabitflowCopy.LIST_TITLE,
            style = MaterialTheme.typography.headlineSmall,
            color = MaterialTheme.colorScheme.onSurface,
        )

        pill?.let {
            Column(Modifier.padding(top = 8.dp)) { SyncPill(it) }
        }

        when (val current = state) {
            is HabitflowUiState.Painted ->
                LazyColumn(
                    modifier = Modifier.fillMaxWidth().padding(top = 12.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    items(current.rows, key = { row -> row.id }) { row -> HabitflowRowView(row) }
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

/** One row: the habit's name and the frequency the site labels it with. */
@Composable
private fun HabitflowRowView(row: HabitRow) {
    Text(
        text = row.name,
        style = MaterialTheme.typography.bodyLarge,
        color = MaterialTheme.colorScheme.onSurface,
    )
}
