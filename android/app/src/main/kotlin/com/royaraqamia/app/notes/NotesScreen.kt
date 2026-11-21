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
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.HorizontalDivider
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
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextStyle
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
 * The surface is drawn from [NotesMetrics], the same measured design the page
 * serves at `/?tab=/notes`; the visual gate compares the two (#1628, ADR-0118).
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

    NotesSurface(
        state = state,
        pill = pill,
        query = query,
        selected = selected,
        onQueryChange = { query = it },
        onOpen = { row ->
            selectedId = row.clientId
            selected = row
        },
        onCreate = {
            scope.launch {
                val created = repository.createNote("")
                selectedId = created.clientId
                selected = created
                paint()
            }
        },
        onBack = {
            selectedId = null
            selected = null
        },
        onSave = { body ->
            selected?.let { note -> scope.launch { repository.updateNote(note.clientId, body); paint() } }
        },
        onDelete = {
            selected?.let { note ->
                scope.launch {
                    repository.deleteNote(note.clientId)
                    selectedId = null
                    selected = null
                    paint()
                }
            }
        },
        modifier = modifier,
    )
}

/**
 * The two halves of the surface, without the store. The visual test composes
 * this with a fixed state; the shell composes it with the rows the device holds.
 */
@Composable
internal fun NotesSurface(
    state: NotesUiState,
    pill: SyncPillState?,
    query: String,
    selected: NoteRow?,
    onQueryChange: (String) -> Unit,
    onOpen: (NoteRow) -> Unit,
    onCreate: () -> Unit,
    onBack: () -> Unit,
    onSave: (String) -> Unit,
    onDelete: () -> Unit,
    modifier: Modifier = Modifier,
    editorEditable: Boolean = true,
) {
    Column(
        modifier =
            modifier
                .fillMaxSize()
                .background(RoyColors.background)
                .padding(horizontal = NotesMetrics.screenPaddingX, vertical = NotesMetrics.screenPaddingY),
    ) {
        Box(
            modifier =
                Modifier.fillMaxWidth().height(NotesMetrics.titleHeight).testTag(NotesMetrics.TITLE),
            contentAlignment = Alignment.Center,
        ) {
            Text(
                text = ServicesCopy.NOTES,
                style =
                    TextStyle(
                        fontFamily = RoyFonts.ui,
                        fontSize = NotesMetrics.titleSize,
                        lineHeight = NotesMetrics.titleLineHeight,
                        fontWeight = NotesMetrics.titleWeight,
                    ),
                color = RoyColors.foreground,
                textAlign = TextAlign.Center,
            )
        }

        Spacer(Modifier.height(NotesMetrics.titleToList))

        if (pill != null) {
            SyncPill(
                state = pill,
                onRetry = null,
            )
            Spacer(Modifier.height(12.dp))
        }

        val editor = selected
        if (editor != null) {
            NoteEditor(
                note = editor,
                onBack = onBack,
                onSave = onSave,
                onDelete = onDelete,
                modifier = Modifier.align(Alignment.CenterHorizontally),
                editable = editorEditable,
            )
        } else {
            val filtered =
                (state as? NotesUiState.Painted)?.notes.orEmpty().filter { row ->
                    val needle = NotesText.normalizeForSearch(query.trim())
                    needle.isEmpty() || NotesText.searchText(row.body).contains(needle)
                }
            NotesListSurface(
                notes = filtered,
                query = query,
                onQueryChange = onQueryChange,
                onOpen = onOpen,
                onCreate = onCreate,
                modifier = Modifier.fillMaxSize(),
            )
        }
    }
}

/** The bordered list the page draws: search, then rows or the empty block. */
@Composable
internal fun NotesListSurface(
    notes: List<NoteRow>,
    query: String,
    onQueryChange: (String) -> Unit,
    onOpen: (NoteRow) -> Unit,
    onCreate: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Box(modifier = modifier) {
        Column(modifier = Modifier.fillMaxSize()) {
            Column(
                modifier =
                    Modifier.fillMaxWidth()
                        .border(
                            width = NotesMetrics.listBorder,
                            color = RoyColors.border,
                            shape = RoundedCornerShape(NotesMetrics.listRadius),
                        )
                        .clip(RoundedCornerShape(NotesMetrics.listRadius))
                        .testTag(NotesMetrics.LIST),
            ) {
                Box(Modifier.fillMaxWidth().padding(NotesMetrics.searchPad)) {
                    OutlinedTextField(
                        value = query,
                        onValueChange = onQueryChange,
                        modifier =
                            Modifier.fillMaxWidth().height(NotesMetrics.searchHeight).testTag(NotesMetrics.SEARCH),
                        singleLine = true,
                        shape = RoundedCornerShape(NotesMetrics.searchRadius),
                        textStyle = TextStyle(fontFamily = RoyFonts.ui, fontSize = NotesMetrics.searchSize),
                        placeholder = {
                            Text(NotesListCopy.SEARCH_PLACEHOLDER, color = RoyColors.placeholder)
                        },
                        leadingIcon = { Icon(LucideVectors.Search, contentDescription = null) },
                        trailingIcon = {
                            if (query.isNotEmpty()) {
                                IconButton(onClick = { onQueryChange("") }) {
                                    Icon(
                                        LucideVectors.X,
                                        contentDescription = NotesListCopy.CLEAR_SEARCH,
                                    )
                                }
                            }
                        },
                    )
                }

                HorizontalDivider(thickness = NotesMetrics.listBorder, color = RoyColors.border)

                if (notes.isEmpty()) {
                    // The page gives the empty block a 40vh floor, not the rest of
                    // the list: centring inside a stretched block moves its two
                    // sentences away from the card's search field.
                    Spacer(Modifier.height(1.dp))
                    Box(Modifier.fillMaxWidth().padding(horizontal = NotesMetrics.listBorder)) {
                        NotesEmpty(
                            searched = query.isNotEmpty(),
                            modifier = Modifier.height(NotesMetrics.emptyMinHeight),
                        )
                    }
                } else {
                    LazyColumn(
                        modifier = Modifier.fillMaxSize(),
                        verticalArrangement = Arrangement.spacedBy(4.dp),
                    ) {
                        items(notes, key = { it.clientId }) { row -> NoteRowView(row, onOpen) }
                    }
                }
            }
        }

        androidx.compose.material3.FloatingActionButton(
            onClick = onCreate,
            modifier = Modifier.align(Alignment.BottomEnd).size(56.dp),
            containerColor = RoyColors.primary,
            contentColor = RoyColors.primaryForeground,
            shape = CircleShape,
        ) {
            Icon(LucideVectors.Plus, contentDescription = NotesCopy.NEW_NOTE)
        }
    }
}

@Composable
private fun NoteRowView(row: NoteRow, onOpen: (NoteRow) -> Unit) {
    val name = NotesText.noteName(row.body).ifEmpty { NotesListCopy.UNTITLED }
    val preview = NotesText.notePreview(row.body)
    Column(
        modifier =
            Modifier.testTag(NotesMetrics.ROW)
                .fillMaxWidth()
                .clip(RoundedCornerShape(NotesMetrics.rowRadius))
                .clickable(onClick = { onOpen(row) })
                .padding(horizontal = NotesMetrics.rowPaddingX, vertical = NotesMetrics.rowPaddingY),
    ) {
        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            Text(
                text = name,
                modifier = Modifier.weight(1f),
                style = TextStyle(fontFamily = RoyFonts.ui, fontSize = 14.sp, fontWeight = androidx.compose.ui.text.font.FontWeight(700)),
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
private fun NotesEmpty(searched: Boolean, modifier: Modifier = Modifier) {
    Column(
        modifier =
            modifier
                .testTag(NotesMetrics.EMPTY)
                .fillMaxWidth()
                .padding(
                    start = NotesMetrics.emptyPadding,
                    top = NotesMetrics.emptyPadding,
                    end = NotesMetrics.emptyPadding,
                    bottom = NotesMetrics.emptyPaddingBottom,
                ),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(
            text = if (searched) NotesListCopy.NO_RESULTS_TITLE else NotesListCopy.EMPTY_TITLE,
            modifier = Modifier.testTag(NotesMetrics.EMPTY_TITLE).height(NotesMetrics.emptyTitleHeight),
            style =
                TextStyle(
                    fontFamily = RoyFonts.ui,
                    fontSize = NotesMetrics.emptyTitleSize,
                    lineHeight = NotesMetrics.emptyTitleLineHeight,
                    fontWeight = NotesMetrics.emptyTitleWeight,
                ),
            color = RoyColors.foreground,
            textAlign = TextAlign.Center,
        )
        Spacer(Modifier.height(NotesMetrics.emptyTitleToBody))
        Text(
            text = if (searched) NotesListCopy.NO_RESULTS_BODY else NotesListCopy.EMPTY_BODY,
            modifier = Modifier.testTag(NotesMetrics.EMPTY_BODY).width(NotesMetrics.emptyBodyWidth),
            style =
                TextStyle(
                    fontFamily = RoyFonts.ui,
                    fontSize = NotesMetrics.emptyBodySize,
                    lineHeight = NotesMetrics.emptyBodyLineHeight,
                ),
            color = RoyColors.mutedForeground,
            textAlign = TextAlign.Center,
        )
    }
}

/**
 * One note, as a plain text editor over the same body the page stores.
 *
 * Every keystroke lands in local state and a short debounce writes it to the
 * store, so there is no Save button to forget — the web's editor behaves the
 * same way (`frontend/ui/notes/note-editor-dialog.tsx`). Its measured shell is
 * the phone sheet the page draws: label, text surface, meta line.
 */
@Composable
internal fun NoteEditor(
    note: NoteRow,
    onBack: () -> Unit,
    onSave: (String) -> Unit,
    onDelete: () -> Unit,
    modifier: Modifier = Modifier,
    editable: Boolean = true,
) {
    var body by remember(note.clientId) { mutableStateOf(note.body) }
    var saved by remember(note.clientId) { mutableStateOf(note.body) }

    LaunchedEffect(body) {
        if (body == saved) return@LaunchedEffect
        delay(AUTOSAVE_DELAY_MS)
        onSave(body)
        saved = body
    }

    val scroll = rememberScrollState()
    val words = body.trim().ifEmpty { null }?.split(Regex("\\s+"))?.size ?: 0
    Column(modifier = modifier.width(NotesMetrics.editorWidth)) {
        // The note's actions belong to the dialog's header on the page; the gate
        // measures the text region below it, so they sit outside that region.
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween,
        ) {
            IconButton(onClick = onBack) {
                Icon(LucideVectors.ArrowRight, contentDescription = NotesCopy.BACK)
            }
            IconButton(onClick = onDelete) {
                Icon(
                    LucideVectors.MoreHorizontal,
                    contentDescription = null,
                    tint = RoyColors.mutedForeground,
                )
                Icon(LucideVectors.Trash2, contentDescription = NotesCopy.DELETE, tint = RoyColors.destructive)
            }
        }
        Column(
            modifier =
                Modifier.height(NotesMetrics.editorHeight)
                    .verticalScroll(scroll)
                    .testTag(NotesMetrics.EDITOR),
        ) {
        Text(
            text = NotesCopy.EDITOR_LABEL,
            modifier = Modifier.height(NotesMetrics.editorLabelHeight),
            style =
                TextStyle(
                    fontFamily = RoyFonts.ui,
                    fontSize = NotesMetrics.editorLabelSize,
                    lineHeight = NotesMetrics.editorLabelLineHeight,
                    fontWeight = NotesMetrics.editorLabelWeight,
                ),
            color = RoyColors.foreground,
        )
        Spacer(Modifier.height(NotesMetrics.editorGap))
        Box(
            modifier =
                Modifier.fillMaxWidth()
                    .height(NotesMetrics.editorBodyHeight)
                    .border(
                        width = NotesMetrics.editorBodyBorder,
                        color = RoyColors.border,
                        shape = RoundedCornerShape(NotesMetrics.editorBodyRadius),
                    )
                    .clip(RoundedCornerShape(NotesMetrics.editorBodyRadius))
                    .background(RoyColors.card.copy(alpha = 0.8f))
                    .semantics { contentDescription = NotesCopy.NEW_NOTE_HINT }
                    .testTag(NotesMetrics.EDITOR_BODY),
        ) {
            Column(Modifier.fillMaxSize()) {
                Spacer(Modifier.height(NotesMetrics.editorBodyTextTop))
                BasicTextField(
                    value = body,
                    onValueChange = { body = it },
                    readOnly = !editable,
                    modifier =
                        Modifier.fillMaxWidth()
                            .padding(horizontal = NotesMetrics.editorBodyTextPad)
                            .weight(1f),
                    textStyle =
                        TextStyle(
                            fontFamily = RoyFonts.ui,
                            fontSize = NotesMetrics.editorBodyTextSize,
                            lineHeight = NotesMetrics.editorBodyLineHeight,
                            color = RoyColors.foreground,
                        ),
                )
            }
        }
        Spacer(Modifier.height(NotesMetrics.editorGap))
        Text(
            text =
                if (words > 0) {
                    "$words ${NotesCopy.WORD} · ${NotesCopy.LAST_EDIT} ${NotesText.timeAgo(note.updatedAt)} · ${NotesCopy.AUTOSAVES}"
                } else {
                    "${NotesCopy.LAST_EDIT} ${NotesText.timeAgo(note.updatedAt)} · ${NotesCopy.AUTOSAVES}"
                },
            modifier = Modifier.height(NotesMetrics.editorMetaHeight),
            style =
                TextStyle(
                    fontFamily = RoyFonts.ui,
                    fontSize = NotesMetrics.editorMetaSize,
                    lineHeight = NotesMetrics.editorMetaLineHeight,
                ),
            color = RoyColors.mutedForeground,
        )
        }
    }
}
