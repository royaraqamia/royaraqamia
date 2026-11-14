package com.royaraqamia.app.notes

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
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
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.OutlinedTextField
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
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.royaraqamia.app.contracts.ApiResult
import com.royaraqamia.app.net.Connectivity
import com.royaraqamia.app.shell.ServicesCopy
import com.royaraqamia.app.store.notes.NoteRow
import com.royaraqamia.app.store.notes.NotesRepository
import com.royaraqamia.app.sync.SyncPill
import com.royaraqamia.app.sync.SyncPillState
import com.royaraqamia.app.theme.RoyColors
import com.royaraqamia.app.theme.RoyFonts
import com.royaraqamia.app.ui.vectors.LucideVectors
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

private const val LIST = "notes-list"
private const val SEARCH = "notes-search"
private const val EMPTY = "notes-empty"
private const val ROW = "notes-row"
private const val EDITOR = "notes-editor"
private const val AUTOSAVE_DELAY_MS = 500L

/**
 * Notes, painted from the device (#1390).
 *
 * The order of the reads is the ticket: [NotesRepository.rows] answers from the
 * database and is awaited *first*, so the frame after the shell's is the rows the
 * last pull wrote — a cold launch with the radio off paints from here. The drain
 * and the pull run beside it and never in front of it: a failure is a
 * [SyncPillState], not an empty list.
 *
 * A tap writes. A new note and every keystroke gone stale by [AUTOSAVE_DELAY_MS]
 * commit the row **and** its replay intent in one transaction, so what the user
 * sees has already survived the process before the request is attempted. The
 * queue drains when the radio returns, not only when this screen is open.
 *
 * The surface is drawn but not switched on: `docs/mobile/screens.json` records it
 * with `enabled: false` until `check:visual` passes (ADR-0117, ADR-0118).
 */
@Composable
fun NotesScreen(repository: NotesRepository, modifier: Modifier = Modifier) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var state by remember { mutableStateOf<NotesUiState>(NotesUiState.Empty) }
    var pill by remember { mutableStateOf<SyncPillState?>(null) }
    var query by remember { mutableStateOf("") }
    var selectedId by remember { mutableStateOf<String?>(null) }
    var selected by remember { mutableStateOf<NoteRow?>(null) }

    suspend fun paint() {
        state = NotesUiState.of(repository.rows())
        selectedId?.let { id -> selected = repository.note(id) }
    }

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

    DisposableEffect(repository) {
        val watch =
            Connectivity.watch(context) {
                scope.launch { sync() }
            }
        onDispose { watch.close() }
    }

    Column(
        modifier =
            modifier
                .fillMaxSize()
                .background(RoyColors.background)
                .padding(horizontal = 16.dp, vertical = 12.dp),
    ) {
        Text(
            text = ServicesCopy.NOTES,
            modifier = Modifier.testTag("notes-title"),
            style =
                TextStyle(
                    fontFamily = RoyFonts.ui,
                    fontSize = 24.sp,
                    lineHeight = 32.sp,
                    fontWeight = FontWeight(700),
                ),
            color = RoyColors.foreground,
        )

        Spacer(Modifier.height(12.dp))

        pill?.let {
            SyncPill(
                state = it,
                onRetry =
                    if (it is SyncPillState.Failed) {
                        { scope.launch { repository.retryFailed(); sync() } }
                    } else {
                        null
                    },
            )
            Spacer(Modifier.height(12.dp))
        }

        val editor = selected
        if (editor != null) {
            NoteEditor(
                note = editor,
                onBack = {
                    selectedId = null
                    selected = null
                },
                onSave = { body -> scope.launch { repository.updateNote(editor.clientId, body); paint() } },
                onDelete = {
                    scope.launch {
                        repository.deleteNote(editor.clientId)
                        selectedId = null
                        selected = null
                        paint()
                    }
                },
            )
        } else {
            val filtered =
                (state as? NotesUiState.Painted)?.notes.orEmpty().filter { row ->
                    val needle = NotesText.normalizeForSearch(query.trim())
                    needle.isEmpty() || NotesText.searchText(row.body).contains(needle)
                }
            Box(modifier = Modifier.fillMaxSize()) {
                Column(modifier = Modifier.fillMaxSize()) {
                    OutlinedTextField(
                        value = query,
                        onValueChange = { query = it },
                        modifier = Modifier.fillMaxWidth().testTag(SEARCH),
                        singleLine = true,
                        placeholder = { Text(NotesListCopy.SEARCH_PLACEHOLDER) },
                        leadingIcon = { Icon(LucideVectors.Search, contentDescription = null) },
                        trailingIcon = {
                            if (query.isNotEmpty()) {
                                IconButton(onClick = { query = "" }) {
                                    Icon(
                                        LucideVectors.X,
                                        contentDescription = NotesListCopy.CLEAR_SEARCH,
                                    )
                                }
                            }
                        },
                    )

                    Spacer(Modifier.height(12.dp))

                    if (filtered.isEmpty()) {
                        NotesEmpty(searched = query.isNotEmpty())
                    } else {
                        LazyColumn(
                            modifier = Modifier.fillMaxSize().testTag(LIST),
                            verticalArrangement = Arrangement.spacedBy(4.dp),
                        ) {
                            items(filtered, key = { it.clientId }) { row ->
                                NoteRowView(row) {
                                    selectedId = row.clientId
                                    selected = row
                                }
                            }
                        }
                    }
                }

                IconButton(
                    onClick = {
                        scope.launch {
                            val created = repository.createNote("")
                            selectedId = created.clientId
                            selected = created
                            paint()
                        }
                    },
                    modifier =
                        Modifier.align(Alignment.BottomEnd)
                            .size(56.dp)
                            .clip(CircleShape)
                            .background(RoyColors.primary),
                ) {
                    Icon(LucideVectors.Plus, contentDescription = NotesCopy.NEW_NOTE, tint = RoyColors.primaryForeground)
                }
            }
        }
    }
}

@Composable
private fun NoteRowView(row: NoteRow, onOpen: () -> Unit) {
    val name = NotesText.noteName(row.body).ifEmpty { NotesListCopy.UNTITLED }
    val preview = NotesText.notePreview(row.body)
    Column(
        modifier =
            Modifier.testTag(ROW)
                .fillMaxWidth()
                .clip(RoundedCornerShape(16.dp))
                .clickable(onClick = onOpen)
                .padding(horizontal = 12.dp, vertical = 10.dp),
    ) {
        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            Text(
                text = name,
                modifier = Modifier.weight(1f),
                style = TextStyle(fontFamily = RoyFonts.ui, fontSize = 14.sp, fontWeight = FontWeight(700)),
                color = RoyColors.foreground,
                maxLines = 1,
            )
            Text(
                text = NotesText.timeAgo(row.updatedAt),
                style = TextStyle(fontFamily = RoyFonts.ui, fontSize = 10.sp),
                color = RoyColors.mutedForeground,
            )
        }
        if (preview.isNotEmpty()) {
            Spacer(Modifier.height(2.dp))
            Text(
                text = preview,
                style = TextStyle(fontFamily = RoyFonts.ui, fontSize = 12.sp, lineHeight = 20.sp),
                color = RoyColors.mutedForeground,
                maxLines = 2,
            )
        }
    }
}

@Composable
private fun NotesEmpty(searched: Boolean) {
    Column(
        modifier =
            Modifier.testTag(EMPTY)
                .fillMaxWidth()
                .padding(24.dp),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(
            text = if (searched) NotesListCopy.NO_RESULTS_TITLE else NotesListCopy.EMPTY_TITLE,
            modifier = Modifier.testTag("notes-empty-title"),
            style = TextStyle(fontFamily = RoyFonts.ui, fontSize = 14.sp, fontWeight = FontWeight(700)),
            color = RoyColors.foreground,
            textAlign = TextAlign.Center,
        )
        Spacer(Modifier.height(8.dp))
        Text(
            text = if (searched) NotesListCopy.NO_RESULTS_BODY else NotesListCopy.EMPTY_BODY,
            modifier = Modifier.testTag("notes-empty-body"),
            style = TextStyle(fontFamily = RoyFonts.ui, fontSize = 12.sp, lineHeight = 20.sp),
            color = RoyColors.mutedForeground,
            textAlign = TextAlign.Center,
        )
    }
}

/**
 * One note, as a plain Markdown editor over the same body the page stores.
 *
 * Every keystroke lands in local state and a short debounce writes it to the
 * store, so there is no Save button to forget — the web's editor behaves the
 * same way (`frontend/ui/notes/note-editor-dialog.tsx`).
 */
@Composable
private fun NoteEditor(
    note: NoteRow,
    onBack: () -> Unit,
    onSave: (String) -> Unit,
    onDelete: () -> Unit,
) {
    var body by remember(note.clientId) { mutableStateOf(note.body) }
    var saved by remember(note.clientId) { mutableStateOf(note.body) }

    LaunchedEffect(body) {
        if (body == saved) return@LaunchedEffect
        delay(AUTOSAVE_DELAY_MS)
        onSave(body)
        saved = body
    }

    Column(modifier = Modifier.fillMaxSize().testTag(EDITOR)) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween,
        ) {
            IconButton(onClick = onBack) {
                Icon(LucideVectors.ArrowRight, contentDescription = NotesCopy.BACK)
            }
            IconButton(onClick = onDelete) {
                Icon(LucideVectors.Trash2, contentDescription = NotesCopy.DELETE, tint = RoyColors.destructive)
            }
        }

        OutlinedTextField(
            value = body,
            onValueChange = { body = it },
            modifier = Modifier.fillMaxWidth().weight(1f).testTag("notes-editor-body"),
            placeholder = { Text(NotesCopy.NEW_NOTE_HINT) },
            keyboardOptions = KeyboardOptions(imeAction = ImeAction.Default),
            textStyle = TextStyle(fontFamily = RoyFonts.ui, fontSize = 15.sp, lineHeight = 24.sp),
        )
    }
}
