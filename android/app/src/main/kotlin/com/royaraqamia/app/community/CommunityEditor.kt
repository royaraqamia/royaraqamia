package com.royaraqamia.app.community

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Icon
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextDirection
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import com.royaraqamia.app.contracts.generated.CommunityIndexResponsePostsItem
import com.royaraqamia.app.net.Connectivity
import com.royaraqamia.app.sync.SyncPill
import com.royaraqamia.app.sync.SyncPillState
import com.royaraqamia.app.theme.LocalRoySpacing
import com.royaraqamia.app.theme.LocalRoyTypeScale
import com.royaraqamia.app.theme.Recipes
import com.royaraqamia.app.theme.RoyColors
import com.royaraqamia.app.ui.vectors.LucideVectors
import java.util.Locale
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/**
 * The community editor over an existing post (#925), the app's half of
 * `app/community/_components/post-composer-dialog.tsx` in edit mode.
 *
 * The site's composer is a dialog; so is this, and that is why the surface has
 * no row of its own in `docs/mobile/screens.json`: the editor is a state of
 * `community`, opened on a post the member owns.
 *
 * The draft is the page's offline promise kept on the device. Every edit commits
 * the post row **and** its `post.save` Outbox intent in one transaction
 * ([CommunityEditorStore.save]) before a request is attempted, so a process
 * killed mid-sentence reopens with the words typed. A later drain sends the
 * newest intent last through the same `PATCH /api/blogpress/posts/{id}` the web
 * composer calls; the server's last-write-wins guard refuses an older replay
 * (ADR-0029), so a stale write cannot overwrite a newer draft.
 *
 * The status line is the site's four save faces — at rest, an unsent draft,
 * saving and a failure — from the one copy source both clients read.
 */
@Composable
fun CommunityEditor(
    post: CommunityIndexResponsePostsItem,
    store: CommunityEditorStore,
    signedIn: Boolean,
    modifier: Modifier = Modifier,
    onDismiss: (CommunityEditorDraft?) -> Unit = {},
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val spacing = LocalRoySpacing.current
    val type = LocalRoyTypeScale.current

    var draft by remember(post.id) { mutableStateOf<CommunityEditorDraft?>(null) }
    var body by remember(post.id) { mutableStateOf("") }
    var loading by remember(post.id) { mutableStateOf(true) }
    var dirty by remember(post.id) { mutableStateOf(false) }
    var state by remember(post.id) {
        mutableStateOf<CommunityEditorUiState>(CommunityEditorUiState.AtRest)
    }
    var pill by remember(post.id) { mutableStateOf<SyncPillState?>(null) }
    var notice by remember(post.id) { mutableStateOf<String?>(null) }

    fun changed(value: String) {
        body = value
        dirty = draft?.let { value != it.body } ?: false
        notice = null
        state =
            if (dirty) {
                CommunityEditorUiState.Draft
            } else {
                CommunityEditorUiState.AtRest
            }
    }

    suspend fun persist(): Boolean {
        val current = draft ?: return false
        val text = body
        if (text.trim().isEmpty()) {
            notice = CommunityEditorCopy.EMPTY_BODY
            state = CommunityEditorUiState.Failed(CommunityEditorCopy.EMPTY_BODY)
            return false
        }
        if (text.length > CommunityLimits.BODY_MAX) {
            val message =
                CommunityEditorCopy.TOO_LONG.replace(
                    "{max}",
                    CommunityLimits.BODY_MAX.toString(),
                )
            notice = message
            state = CommunityEditorUiState.Failed(message)
            return false
        }
        // Opening the editor and pressing save must not queue a write of the row
        // it just read (#925). A queue an offline autosave already holds is still
        // sent, so the control flushes what the device owes rather than only the
        // change it happens to be looking at.
        if (!dirty) {
            if (signedIn && Connectivity.isOnline(context)) {
                val report = store.drain()
                pill =
                    when {
                        report.failed > 0 -> SyncPillState.Failed(report.failed)
                        report.pending > 0 -> SyncPillState.Pending(report.pending)
                        else -> null
                    }
                state =
                    when {
                        report.failed > 0 ->
                            CommunityEditorUiState.Failed(CommunityEditorCopy.SAVE_FAILED)
                        report.pending > 0 -> CommunityEditorUiState.Draft
                        else -> CommunityEditorUiState.AtRest
                    }
                return state !is CommunityEditorUiState.Failed
            }
            return true
        }

        state = CommunityEditorUiState.Saving
        val saved = store.save(current.id, text)
        if (saved == null) {
            state = CommunityEditorUiState.Failed(CommunityEditorCopy.SAVE_FAILED)
            return false
        }
        draft = saved
        // Only the snapshot this write covered may be marked clean: text typed
        // while it was in flight is still a draft, and the debounce flushes it.
        val stillDirty = body != saved.body
        dirty = stillDirty

        if (signedIn && Connectivity.isOnline(context)) {
            val report = store.drain()
            pill =
                when {
                    report.failed > 0 -> SyncPillState.Failed(report.failed)
                    report.pending > 0 -> SyncPillState.Pending(report.pending)
                    else -> null
                }
            state =
                when {
                    report.failed > 0 -> CommunityEditorUiState.Failed(CommunityEditorCopy.SAVE_FAILED)
                    stillDirty -> CommunityEditorUiState.Draft
                    else -> CommunityEditorUiState.AtRest
                }
        } else {
            val status = store.outboxStatus()
            pill =
                if (Connectivity.isOnline(context)) {
                    SyncPillState.Pending(status.pending)
                } else {
                    SyncPillState.Offline(status.pending)
                }
            state =
                when {
                    status.failed > 0 -> CommunityEditorUiState.Failed(CommunityEditorCopy.SAVE_FAILED)
                    else -> CommunityEditorUiState.Draft
                }
        }
        return state !is CommunityEditorUiState.Failed
    }

    LaunchedEffect(post.id, store) {
        val opened = store.open(post)
        loading = false
        if (opened == null) {
            state = CommunityEditorUiState.Failed(CommunityEditorCopy.SAVE_FAILED)
            return@LaunchedEffect
        }
        draft = opened
        body = opened.body
        dirty = false
        state = CommunityEditorUiState.AtRest
    }

    // The page's 1.2 s debounce, and only a real edit arms it: opening the editor
    // does not queue a write of the row it just read.
    LaunchedEffect(dirty, body) {
        if (!dirty || loading) return@LaunchedEffect
        delay(1_200)
        persist()
    }

    fun close() {
        scope.launch {
            persist()
            onDismiss(draft)
        }
    }

    Dialog(onDismissRequest = ::close) {
        Surface(
            shape = Recipes.Card.radius,
            color = RoyColors.background,
            border = Recipes.Card.border,
            modifier = modifier.fillMaxWidth(0.94f),
        ) {
            Column(
                modifier = Modifier.padding(Recipes.Card.padding(spacing)),
                verticalArrangement = Arrangement.spacedBy(spacing.elementGapSm),
            ) {
                Text(
                    text = CommunityEditorCopy.TITLE,
                    style = type.body.copy(fontWeight = FontWeight.Bold),
                    color = RoyColors.foreground,
                    modifier = Modifier.testTag("community-editor-title"),
                )

                OutlinedTextField(
                    value = body,
                    onValueChange = ::changed,
                    label = { Text(CommunityEditorCopy.BODY_LABEL) },
                    placeholder = { Text(CommunityEditorCopy.BODY_PLACEHOLDER) },
                    enabled = !loading,
                    minLines = 6,
                    keyboardOptions =
                        KeyboardOptions(
                            keyboardType = KeyboardType.Text,
                            autoCorrectEnabled = true,
                        ),
                    modifier =
                        Modifier.fillMaxWidth()
                            .testTag("community-editor-body")
                            .semantics { contentDescription = CommunityEditorCopy.BODY_ARIA },
                )

                // `dir="ltr"`: two numbers around a slash, and RTL puts the
                // logical first run rightmost. The digits are ASCII (#925).
                Text(
                    text =
                        CommunityEditorCopy.COUNTER
                            .replace("{count}", body.length.toString())
                            .replace(
                                "{max}",
                                String.format(Locale.US, "%,d", CommunityLimits.BODY_MAX),
                            ),
                    style = type.xs.copy(textDirection = TextDirection.Ltr),
                    color =
                        if (body.length > CommunityLimits.BODY_MAX) {
                            RoyColors.destructive
                        } else {
                            RoyColors.mutedForeground
                        },
                    textAlign = TextAlign.End,
                    modifier = Modifier.fillMaxWidth().testTag("community-editor-counter"),
                )

                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                ) {
                    Icon(
                        imageVector =
                            when (state) {
                                is CommunityEditorUiState.AtRest -> LucideVectors.Check
                                is CommunityEditorUiState.Draft -> LucideVectors.Pencil
                                is CommunityEditorUiState.Saving -> LucideVectors.LoaderCircle
                                is CommunityEditorUiState.Failed -> LucideVectors.X
                            },
                        contentDescription = null,
                        tint =
                            when (state) {
                                is CommunityEditorUiState.AtRest -> RoyColors.success
                                is CommunityEditorUiState.Failed -> RoyColors.destructive
                                else -> RoyColors.mutedForeground
                            },
                        modifier = Modifier.size(Recipes.Glyph.sm),
                    )
                    Text(
                        text = statusLabel(state),
                        style = type.xs,
                        color =
                            if (state is CommunityEditorUiState.Failed) {
                                RoyColors.destructive
                            } else {
                                RoyColors.mutedForeground
                            },
                        modifier = Modifier.testTag("community-editor-status"),
                    )
                }

                notice?.let { message ->
                    Text(text = message, style = type.xs, color = RoyColors.destructive)
                }

                if (signedIn) {
                    pill?.let { current ->
                        SyncPill(
                            state = current,
                            onRetry = {
                                scope.launch {
                                    store.drain()
                                    state = CommunityEditorUiState.AtRest
                                }
                            },
                        )
                    }
                }

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                ) {
                    TextButton(onClick = ::close, enabled = !loading) {
                        Text(CommunityEditorCopy.CANCEL, style = type.xs)
                    }
                    Spacer(Modifier.weight(1f))
                    TextButton(
                        onClick = {
                            scope.launch { if (persist()) onDismiss(draft) }
                        },
                        enabled = !loading,
                        modifier = Modifier.testTag("community-editor-save"),
                    ) {
                        Icon(
                            imageVector =
                                if (state is CommunityEditorUiState.Saving) {
                                    LucideVectors.LoaderCircle
                                } else {
                                    LucideVectors.Save
                                },
                            contentDescription = null,
                            modifier = Modifier.size(Recipes.Glyph.sm),
                        )
                        Spacer(Modifier.width(4.dp))
                        Text(
                            text =
                                if (state is CommunityEditorUiState.Saving) {
                                    CommunityEditorCopy.SAVING
                                } else {
                                    CommunityEditorCopy.SAVE
                                },
                            style = type.xs,
                        )
                    }
                }
            }
        }
    }
}

/** The site's four save sentences, from the one copy source. */
private fun statusLabel(state: CommunityEditorUiState): String =
    when (state) {
        is CommunityEditorUiState.AtRest -> CommunityEditorCopy.SAVED
        is CommunityEditorUiState.Draft -> CommunityEditorCopy.UNSAVED
        is CommunityEditorUiState.Saving -> CommunityEditorCopy.SAVING
        is CommunityEditorUiState.Failed -> state.message
    }
