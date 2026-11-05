package com.royaraqamia.app.habitflow

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
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
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.royaraqamia.app.contracts.ApiResult
import com.royaraqamia.app.net.Connectivity
import com.royaraqamia.app.store.habitflow.HabitRow
import com.royaraqamia.app.store.habitflow.HabitflowRepository
import com.royaraqamia.app.sync.SyncPill
import com.royaraqamia.app.sync.SyncPillState
import com.royaraqamia.app.theme.RoyColors
import com.royaraqamia.app.theme.RoyFonts
import com.royaraqamia.app.ui.vectors.LucideVectors
import kotlinx.coroutines.launch

/**
 * HabitFlow's list, painted from the device (#649), with its writes (#650) and
 * its measured match to the page (#898).
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
 * The heading and the empty state are the page's own boxes ([HabitflowMetrics]):
 * the visual gate compares them with `app/habitflow` at the app's viewport, so a
 * changed size, gap or padding fails `check:visual` instead of drifting quietly
 * (ADR-0118). A `LazyColumn` rather than a `Column` for the rows: 500 habits have
 * to scroll inside the frame budget, which means only the visible ones are
 * composed.
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

    HabitflowScreenContent(
        state = state,
        done = done,
        pill = pill,
        onToggle = { row ->
            scope.launch {
                repository.toggleLog(
                    habitId = row.id,
                    date = repository.today(),
                    completed = !done.contains(row.id),
                )
                // The write is on disk before this paints, so the checkbox never
                // shows a state the store does not hold.
                paint()
                sync()
            }
        },
        onRetry = {
            scope.launch {
                repository.retryFailed()
                sync()
            }
        },
        modifier = modifier,
    )
}

/**
 * The screen over a state the caller already holds, so the visual gate can draw
 * it without a database or a network (#898, ADR-0118): the test composes this and
 * never loads.
 */
@Composable
internal fun HabitflowScreen(state: HabitflowUiState, modifier: Modifier = Modifier) {
    HabitflowScreenContent(
        state = state,
        done = emptySet(),
        pill = null,
        onToggle = {},
        onRetry = {},
        modifier = modifier,
    )
}

@Composable
private fun HabitflowScreenContent(
    state: HabitflowUiState,
    done: Set<String>,
    pill: SyncPillState?,
    onToggle: (HabitRow) -> Unit,
    onRetry: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val count = (state as? HabitflowUiState.Painted)?.rows?.size ?: 0

    Column(
        modifier =
            modifier
                .fillMaxSize()
                .background(RoyColors.background)
                .padding(horizontal = HabitflowMetrics.horizontalPadding, vertical = 12.dp),
    ) {
        Column(
            modifier = Modifier.testTag(HabitflowMetrics.LIST).fillMaxWidth().weight(1f),
        ) {
            ListHeader(count)

            Spacer(Modifier.height(HabitflowMetrics.listGap))

            pill?.let {
                SyncPill(state = it, onRetry = if (it is SyncPillState.Failed) onRetry else null)
                Spacer(Modifier.height(HabitflowMetrics.listGap))
            }

            when (state) {
                is HabitflowUiState.Painted ->
                    LazyColumn(
                        modifier = Modifier.fillMaxWidth().weight(1f),
                        verticalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        items(state.rows, key = { row -> row.id }) { row ->
                            HabitflowRowView(
                                row = row,
                                completed = done.contains(row.id),
                                onToggle = { onToggle(row) },
                            )
                        }
                    }
                HabitflowUiState.Empty -> EmptyList()
            }
        }
    }
}

/** The page's list heading: the title, and the count once there is something to count. */
@Composable
private fun ListHeader(count: Int) {
    Column(modifier = Modifier.testTag(HabitflowMetrics.HEADER).fillMaxWidth()) {
        Row(
            modifier = Modifier.fillMaxWidth().height(HabitflowMetrics.titleHeight),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Text(
                text = HabitflowCopy.LIST_TITLE,
                modifier = Modifier.testTag(HabitflowMetrics.TITLE),
                style =
                    TextStyle(
                        fontFamily = RoyFonts.ui,
                        fontSize = HabitflowMetrics.titleSize,
                        lineHeight = HabitflowMetrics.titleLineHeight,
                        fontWeight = HabitflowMetrics.titleWeight,
                    ),
                color = RoyColors.foreground,
            )
            if (count > 0) {
                CountPill(count)
            }
        }
        // The page's 8 padding and 1px transparent border under the heading.
        Spacer(Modifier.height(HabitflowMetrics.headerTrailing))
    }
}

/** The page's count badge: a pill whose only variable is the number inside it. */
@Composable
private fun CountPill(count: Int) {
    val shape = RoundedCornerShape(percent = HabitflowMetrics.countRadius)

    Box(
        modifier =
            Modifier.testTag(HabitflowMetrics.COUNT)
                .height(HabitflowMetrics.countHeight)
                .clip(shape)
                .background(Color(0xFF27272A).copy(alpha = 0.5f))
                .border(1.dp, Color(0xFF3F3F46).copy(alpha = 0.5f), shape)
                .padding(horizontal = HabitflowMetrics.countPaddingX, vertical = HabitflowMetrics.countPaddingY),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text = count.toString(),
            style =
                TextStyle(
                    fontFamily = RoyFonts.digits,
                    fontSize = HabitflowMetrics.countTextSize,
                    lineHeight = HabitflowMetrics.countLineHeight,
                ),
            color = Color(0xFFD4D4D8),
        )
    }
}

/** The page's empty state: the dashed block, its icon tile, and the two sentences. */
@Composable
private fun EmptyList() {
    val shape = RoundedCornerShape(HabitflowMetrics.emptyRadius)

    Column(
        modifier =
            Modifier.testTag(HabitflowMetrics.EMPTY)
                .fillMaxWidth()
                .clip(shape)
                .background(
                    Brush.verticalGradient(
                        listOf(Color(0xFF18181B).copy(alpha = 0.5f), Color.Transparent),
                    ),
                )
                .border(1.dp, Color(0xFF27272A), shape)
                .padding(
                    start = HabitflowMetrics.emptyContentPaddingX,
                    end = HabitflowMetrics.emptyContentPaddingX,
                    top = HabitflowMetrics.emptyContentPadding,
                    bottom = HabitflowMetrics.emptyContentPadding,
                ),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Box(
            modifier =
                Modifier.testTag(HabitflowMetrics.EMPTY_ICON)
                    .size(HabitflowMetrics.iconTileSize)
                    .clip(RoundedCornerShape(HabitflowMetrics.iconTileRadius))
                    .background(Color(0xFF18181B))
                    .border(1.dp, Color(0xFF27272A), RoundedCornerShape(HabitflowMetrics.iconTileRadius)),
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                imageVector = LucideVectors.ListChecks,
                contentDescription = null,
                tint = RoyColors.primary,
                modifier = Modifier.size(HabitflowMetrics.iconSize),
            )
        }

        Spacer(Modifier.height(HabitflowMetrics.iconToTitle))

        Text(
            text = HabitflowCopy.EMPTY_TITLE,
            modifier = Modifier.testTag(HabitflowMetrics.EMPTY_TITLE).height(HabitflowMetrics.emptyTitleHeight),
            style =
                TextStyle(
                    fontFamily = RoyFonts.ui,
                    fontSize = HabitflowMetrics.emptyTitleSize,
                    lineHeight = HabitflowMetrics.emptyTitleLineHeight,
                    fontWeight = HabitflowMetrics.emptyTitleWeight,
                ),
            color = RoyColors.foreground,
        )

        Spacer(Modifier.height(HabitflowMetrics.emptyBodyGap))

        Text(
            text = HabitflowCopy.EMPTY_BODY,
            modifier =
                Modifier.testTag(HabitflowMetrics.EMPTY_BODY)
                    .fillMaxWidth()
                    .height(HabitflowMetrics.emptyBodyHeight),
            style =
                TextStyle(
                    fontFamily = RoyFonts.ui,
                    fontSize = HabitflowMetrics.emptyBodySize,
                    lineHeight = HabitflowMetrics.emptyBodyLineHeight,
                ),
            color = Color(0xFFA1A1AA),
            textAlign = TextAlign.Center,
        )
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
