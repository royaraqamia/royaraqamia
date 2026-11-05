package com.royaraqamia.app.blogpress

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
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
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextDirection
import androidx.compose.ui.unit.dp
import com.royaraqamia.app.contracts.ApiResult
import com.royaraqamia.app.net.Connectivity
import com.royaraqamia.app.store.blogpress.BlogpressEditorFields
import com.royaraqamia.app.store.blogpress.BlogpressEditorStore
import com.royaraqamia.app.store.blogpress.BlogpressPostRow
import com.royaraqamia.app.sync.SyncPill
import com.royaraqamia.app.sync.SyncPillState
import com.royaraqamia.app.theme.LocalRoySpacing
import com.royaraqamia.app.theme.LocalRoyTypeScale
import com.royaraqamia.app.theme.Recipes
import com.royaraqamia.app.theme.RoyColors
import com.royaraqamia.app.ui.vectors.LucideVectors
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/**
 * The BlogPress editor over `/blogpress/editor/[id]` (#954), the app's half of
 * `app/blogpress/(app)/editor/[id]/editor-content.tsx`.
 *
 * The page's Local Store is the source of truth: the screen opens the row the
 * route names, paints its fields from the device, and every edit commits the row
 * **and** its `post.save` Outbox intent in one transaction before any request is
 * attempted ([BlogpressEditorStore.saveDraft]). That is what makes a draft typed
 * with the radio off survive a process kill: the text is on disk, and the queue
 * is what carries it to the server when the radio returns.
 *
 * The autosave is the page's debounce (1.2 s), and the status line is the page's
 * own four faces - at rest, an unsent draft, saving, and a failure. A write that
 * has not reached the server says so through the shared sync pill; a later drain
 * sends the newest intent last and the server's last-write-wins guard refuses an
 * older replay (ADR-0029), so a stale write cannot overwrite a newer draft.
 *
 * Publishing stays online-only (ADR-0031), like the page: the control says the
 * radio is needed instead of queuing a promise the server cannot keep later.
 */
@Composable
fun BlogpressEditorScreen(
    postId: String,
    store: BlogpressEditorStore,
    signedIn: Boolean,
    modifier: Modifier = Modifier,
    onBack: () -> Unit = {},
    onOpenPost: (String) -> Unit = {},
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val spacing = LocalRoySpacing.current
    val type = LocalRoyTypeScale.current

    var row by remember(postId) { mutableStateOf<BlogpressPostRow?>(null) }
    var content by remember(postId) { mutableStateOf("") }
    var slug by remember(postId) { mutableStateOf("") }
    var coverImage by remember(postId) { mutableStateOf("") }
    var metaTitle by remember(postId) { mutableStateOf("") }
    var metaDesc by remember(postId) { mutableStateOf("") }
    var loading by remember(postId) { mutableStateOf(true) }
    var dirty by remember(postId) { mutableStateOf(false) }
    var saveState by remember(postId) {
        mutableStateOf<BlogpressEditorUiState>(BlogpressEditorUiState.AtRest)
    }
    var pill by remember(postId) { mutableStateOf<SyncPillState?>(null) }
    var notice by remember(postId) { mutableStateOf<String?>(null) }
    var showSettings by remember(postId) { mutableStateOf(true) }
    var focusMode by remember(postId) { mutableStateOf(false) }

    fun fields(): BlogpressEditorFields =
        BlogpressEditorFields(
            slug = slug.trim(),
            content = content,
            coverImage = coverImage,
            metaTitle = metaTitle,
            metaDesc = metaDesc,
        )

    suspend fun persist() {
        val current = row ?: return
        if (!dirty) return
        val written = fields()
        saveState = BlogpressEditorUiState.Saving
        val saved = store.saveDraft(current.id, written)
        if (saved == null) {
            saveState = BlogpressEditorUiState.Failed(BlogpressEditorCopy.SAVE_FAILED)
            return
        }
        row = saved
        // Only the snapshot this write covered may be marked clean: text typed
        // while it was in flight is still a draft, and the debounce will flush it.
        val stillDirty = written != fields()
        if (!stillDirty) dirty = false

        if (signedIn && Connectivity.isOnline(context)) {
            val report = store.drain()
            pill =
                when {
                    report.failed > 0 -> SyncPillState.Failed(report.failed)
                    report.pending > 0 -> SyncPillState.Pending(report.pending)
                    else -> null
                }
            saveState =
                when {
                    report.failed > 0 -> BlogpressEditorUiState.Failed(BlogpressEditorCopy.SAVE_FAILED)
                    stillDirty -> BlogpressEditorUiState.Draft
                    else -> BlogpressEditorUiState.AtRest
                }
        } else {
            val status = store.outboxStatus()
            pill =
                if (Connectivity.isOnline(context)) {
                    SyncPillState.Pending(status.pending)
                } else {
                    SyncPillState.Offline(status.pending)
                }
            saveState =
                when {
                    status.failed > 0 -> BlogpressEditorUiState.Failed(BlogpressEditorCopy.SAVE_FAILED)
                    else -> BlogpressEditorUiState.Draft
                }
        }
    }

    LaunchedEffect(postId, store) {
        val loaded = store.editorPost(postId)
        loading = false
        if (loaded == null) {
            saveState = BlogpressEditorUiState.Failed(BlogpressEditorCopy.SAVE_FAILED)
            return@LaunchedEffect
        }
        row = loaded
        content = loaded.content
        slug = loaded.slug
        coverImage = loaded.coverImage
        metaTitle = loaded.metaTitle
        metaDesc = loaded.metaDesc
    }

    // The page's 1.2 s debounce. Only a real edit arms it, so opening the editor
    // does not queue a write of the row it just read.
    LaunchedEffect(dirty, content, slug, coverImage, metaTitle, metaDesc) {
        if (!dirty) return@LaunchedEffect
        delay(1_200)
        persist()
    }

    fun edit(change: () -> Unit) {
        change()
        dirty = true
        notice = null
        saveState = BlogpressEditorUiState.Draft
    }

    fun saveNow() {
        scope.launch { persist() }
    }

    fun back() {
        scope.launch {
            persist()
            onBack()
        }
    }

    fun publish() {
        val current = row ?: return
        scope.launch {
            notice = null
            if (!Connectivity.isOnline(context)) {
                notice = BlogpressEditorCopy.NEEDS_CONNECTION
                return@launch
            }
            when (val answer = store.publishPost(current.id)) {
                is ApiResult.Success -> {
                    saveState = BlogpressEditorUiState.AtRest
                    onOpenPost(slug)
                }
                is ApiResult.Failure -> notice = BlogpressEditorCopy.PUBLISH_FAILED
            }
        }
    }

    Column(
        modifier =
            modifier
                .fillMaxSize()
                .padding(horizontal = spacing.containerPadding),
        verticalArrangement = Arrangement.spacedBy(spacing.elementGapSm),
    ) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(top = spacing.sectionSm),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(4.dp),
        ) {
            IconButton(onClick = ::back) {
                Icon(
                    imageVector = LucideVectors.ArrowRight,
                    contentDescription = BlogpressEditorCopy.BACK_TO_DASHBOARD,
                )
            }
            Text(
                text = BlogpressEditorCopy.EDITING_TITLE,
                style = type.h5,
                color = RoyColors.foreground,
                modifier = Modifier.testTag("blogpress-editor-title"),
            )
            Spacer(Modifier.weight(1f))
            IconButton(onClick = { showSettings = !showSettings }) {
                Icon(
                    imageVector = LucideVectors.PanelRight,
                    contentDescription =
                        if (showSettings) {
                            BlogpressEditorCopy.PANEL_CLOSE
                        } else {
                            BlogpressEditorCopy.PANEL_OPEN
                        },
                    tint = RoyColors.mutedForeground,
                )
            }
            IconButton(onClick = { focusMode = !focusMode }) {
                Icon(
                    imageVector = LucideVectors.Focus,
                    contentDescription =
                        if (focusMode) {
                            BlogpressEditorCopy.FOCUS_EXIT
                        } else {
                            BlogpressEditorCopy.FOCUS_MODE
                        },
                    tint = if (focusMode) RoyColors.primary else RoyColors.mutedForeground,
                )
            }
            IconButton(onClick = ::saveNow) {
                Icon(
                    imageVector =
                        if (saveState is BlogpressEditorUiState.Saving) {
                            LucideVectors.LoaderCircle
                        } else {
                            LucideVectors.Save
                        },
                    contentDescription = BlogpressEditorCopy.SAVE,
                    tint = RoyColors.primary,
                )
            }
        }

        if (signedIn) {
            pill?.let { current ->
                SyncPill(
                    state = current,
                    onRetry = {
                        scope.launch {
                            store.drain()
                            saveState = BlogpressEditorUiState.AtRest
                        }
                    },
                )
            }
        }

        val status = statusLabel(saveState)
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            Icon(
                imageVector =
                    when (saveState) {
                        is BlogpressEditorUiState.AtRest -> LucideVectors.Check
                        is BlogpressEditorUiState.Draft -> LucideVectors.Pencil
                        is BlogpressEditorUiState.Saving -> LucideVectors.LoaderCircle
                        is BlogpressEditorUiState.Failed -> LucideVectors.X
                    },
                contentDescription = null,
                tint =
                    when (saveState) {
                        is BlogpressEditorUiState.AtRest -> RoyColors.success
                        is BlogpressEditorUiState.Failed -> RoyColors.destructive
                        else -> RoyColors.mutedForeground
                    },
                modifier = Modifier.size(Recipes.Glyph.sm),
            )
            Text(
                text = status,
                style = type.xs,
                color =
                    if (saveState is BlogpressEditorUiState.Failed) {
                        RoyColors.destructive
                    } else {
                        RoyColors.mutedForeground
                    },
                modifier = Modifier.testTag("blogpress-editor-status"),
            )
        }

        if (!Connectivity.isOnline(context)) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                Icon(
                    imageVector = LucideVectors.CloudOff,
                    contentDescription = null,
                    tint = RoyColors.warning,
                    modifier = Modifier.size(Recipes.Glyph.sm),
                )
                Text(
                    text = BlogpressEditorCopy.NEEDS_CONNECTION,
                    style = type.xs,
                    color = RoyColors.warning,
                )
            }
        }

        notice?.let { message ->
            Text(text = message, style = type.xs, color = RoyColors.destructive)
        }

        Column(
            modifier =
                Modifier.fillMaxSize()
                    .verticalScroll(rememberScrollState())
                    .padding(bottom = spacing.sectionSm),
            verticalArrangement = Arrangement.spacedBy(spacing.elementGapSm),
        ) {
            OutlinedTextField(
                value = content,
                onValueChange = { edit { content = it } },
                placeholder = { Text(BlogpressEditorCopy.CONTENT_PLACEHOLDER) },
                enabled = !loading,
                minLines = 8,
                modifier =
                    Modifier.fillMaxWidth()
                        .heightIn(min = 220.dp)
                        .testTag("blogpress-editor-content")
                        .semantics { contentDescription = BlogpressEditorCopy.CONTENT_PLACEHOLDER },
            )

            if (showSettings && !focusMode) {
                OutlinedTextField(
                    value = slug,
                    onValueChange = { edit { slug = it } },
                    label = { Text(BlogpressEditorCopy.SLUG_LABEL) },
                    singleLine = true,
                    enabled = !loading,
                    keyboardOptions =
                        KeyboardOptions(keyboardType = KeyboardType.Uri, autoCorrectEnabled = false),
                    // The page's slug field is `dir="ltr"` even in the Arabic
                    // editor; the value is a URL segment, not prose (#954).
                    textStyle =
                        MaterialTheme.typography.bodyLarge.copy(
                            textDirection = TextDirection.Ltr
                        ),
                    modifier = Modifier.fillMaxWidth().testTag("blogpress-editor-slug"),
                )
                OutlinedTextField(
                    value = metaTitle,
                    onValueChange = { edit { metaTitle = it } },
                    label = { Text(BlogpressEditorCopy.META_TITLE_LABEL) },
                    singleLine = true,
                    enabled = !loading,
                    modifier = Modifier.fillMaxWidth().testTag("blogpress-editor-meta-title"),
                )
                OutlinedTextField(
                    value = metaDesc,
                    onValueChange = { edit { metaDesc = it } },
                    label = { Text(BlogpressEditorCopy.META_DESC_LABEL) },
                    minLines = 2,
                    enabled = !loading,
                    modifier = Modifier.fillMaxWidth().testTag("blogpress-editor-meta-desc"),
                )
            }

            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                // The page uploads a cover image; the app has no multipart write
                // yet (#945), so the control names itself and is not offered.
                TextButton(onClick = {}, enabled = false) {
                    Icon(
                        imageVector = LucideVectors.Upload,
                        contentDescription = null,
                        modifier = Modifier.size(Recipes.Glyph.sm),
                    )
                    Spacer(Modifier.width(4.dp))
                    Text(BlogpressEditorCopy.IMAGE, style = type.xs)
                }
                Spacer(Modifier.weight(1f))
                TextButton(
                    onClick = ::saveNow,
                    enabled = !loading,
                    modifier = Modifier.testTag("blogpress-editor-save"),
                ) {
                    Icon(
                        imageVector =
                            if (saveState is BlogpressEditorUiState.Saving) {
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
                            if (saveState is BlogpressEditorUiState.Saving) {
                                BlogpressEditorCopy.SAVING
                            } else {
                                BlogpressEditorCopy.SAVE
                            },
                        style = type.xs,
                    )
                }
                if (row?.status == "draft") {
                    TextButton(onClick = ::publish, enabled = !loading) {
                        Icon(
                            imageVector = LucideVectors.Send,
                            contentDescription = null,
                            modifier = Modifier.size(Recipes.Glyph.sm),
                        )
                        Spacer(Modifier.width(4.dp))
                        Text(BlogpressEditorCopy.PUBLISH, style = type.xs)
                    }
                }
            }
        }
    }
}

/** The page's four save sentences, from the one copy source. */
private fun statusLabel(state: BlogpressEditorUiState): String =
    when (state) {
        is BlogpressEditorUiState.AtRest -> BlogpressEditorCopy.SAVED
        is BlogpressEditorUiState.Draft -> BlogpressEditorCopy.UNSAVED
        is BlogpressEditorUiState.Saving -> BlogpressEditorCopy.SAVING
        is BlogpressEditorUiState.Failed -> state.message
    }
