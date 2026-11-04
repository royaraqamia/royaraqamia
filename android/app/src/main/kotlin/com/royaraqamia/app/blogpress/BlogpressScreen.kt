package com.royaraqamia.app.blogpress

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
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.royaraqamia.app.contracts.ApiError
import com.royaraqamia.app.contracts.ApiResult
import com.royaraqamia.app.community.PostText
import com.royaraqamia.app.net.Connectivity
import com.royaraqamia.app.store.blogpress.BlogpressPostRow
import com.royaraqamia.app.store.blogpress.BlogpressRepository
import com.royaraqamia.app.sync.SyncPill
import com.royaraqamia.app.sync.SyncPillState
import com.royaraqamia.app.theme.LocalRoySpacing
import com.royaraqamia.app.theme.LocalRoyTypeScale
import com.royaraqamia.app.theme.Recipes
import com.royaraqamia.app.theme.RoyColors
import com.royaraqamia.app.ui.vectors.LucideVectors
import kotlin.math.ceil
import kotlinx.coroutines.launch
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

/**
 * The BlogPress posts list (#952), the app's half of
 * `app/blogpress/_components/post-list.tsx`.
 *
 * The order of the reads is HabitFlow's (#649), SpendTrack's (#653) and
 * LinkSnap's (#654): [BlogpressRepository.posts] answers from the database and
 * is awaited *first*, so a cold launch with the radio off paints the rows the
 * last pull wrote. The drain and the pull run beside them and never in front of
 * them: a failure is a [SyncPillState], not an empty list.
 *
 * A delete and its undo commit the row **and** their replay intent in one
 * transaction, so what the user sees happen has already survived the process
 * before the request is attempted. The queue also drains with the app closed
 * ([com.royaraqamia.app.sync.OutboxDrainWorker]) and on reconnection
 * ([com.royaraqamia.app.shell.ShellActivity]), which is what makes an offline
 * write reach the server without this screen being open.
 *
 * The publication transitions the page only offers online (ADR-0031) — publish,
 * unpublish, pin and duplicate — say so with the radio off rather than queueing
 * a promise the server cannot keep later. The editor, the calendar, categories
 * and tags are the document; this slice draws the list and its owner's actions.
 */
@Composable
fun BlogpressScreen(
    repository: BlogpressRepository,
    signedIn: Boolean,
    modifier: Modifier = Modifier,
    onOpenEditor: (String) -> Unit = {},
    onOpenPost: (String) -> Unit = {},
    onExport: (label: String, content: String, format: String) -> Unit = { _, _, _ -> },
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()

    var state by remember { mutableStateOf<BlogpressUiState>(BlogpressUiState.Empty) }
    var pill by remember { mutableStateOf<SyncPillState?>(null) }
    var filter by remember { mutableStateOf("all") }
    var query by remember { mutableStateOf("") }
    var selected by remember { mutableStateOf<Set<String>>(emptySet()) }
    var deleting by remember { mutableStateOf<BlogpressPostRow?>(null) }
    var deletingBulk by remember { mutableStateOf(false) }
    var undo by remember { mutableStateOf<BlogpressPostRow?>(null) }
    var notice by remember { mutableStateOf<String?>(null) }
    var busy by remember { mutableStateOf(false) }

    val posts = (state as? BlogpressUiState.Painted)?.posts.orEmpty()
    val visible =
        posts.filter { row ->
            val matchesFilter = filter == "all" || row.status == filter
            val needle = query.trim()
            val matchesQuery =
                needle.isEmpty() ||
                    row.content.contains(needle, ignoreCase = true) ||
                    row.slug.contains(needle, ignoreCase = true) ||
                    row.metaDesc.contains(needle, ignoreCase = true)
            matchesFilter && matchesQuery
        }

    /** Repaint from the store alone: no network, no session, no wait. */
    suspend fun paint() {
        state = BlogpressUiState.of(repository.posts())
    }

    /**
     * The delivery half: drain what is queued, then pull what is new.
     *
     * A radio that is off is not a failed sync — it is the pill's Offline state,
     * and the queued count comes from the queue itself rather than from a guess.
     */
    suspend fun sync() {
        paint()
        if (!signedIn) {
            pill = null
            return
        }
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

    LaunchedEffect(repository, signedIn) { sync() }

    // The radio returning is the trigger "a queued write drains", so this screen
    // hears it too rather than waiting for a recomposition that may never come.
    DisposableEffect(repository) {
        val watch = Connectivity.watch(context) { scope.launch { sync() } }
        onDispose { watch.close() }
    }

    /** A publication transition the page refuses with the radio off (ADR-0031). */
    fun online(action: suspend () -> ApiResult<String>, failure: String) {
        if (busy) return
        scope.launch {
            busy = true
            notice = null
            try {
                if (!Connectivity.isOnline(context)) {
                    notice = BlogpressCopy.NEEDS_CONNECTION
                    return@launch
                }
                when (val answer = action()) {
                    is ApiResult.Success -> sync()
                    is ApiResult.Failure -> notice = messageFor(answer.error, failure)
                }
            } finally {
                busy = false
            }
        }
    }

    fun create() {
        if (busy) return
        scope.launch {
            busy = true
            notice = null
            try {
                if (!Connectivity.isOnline(context)) {
                    notice = BlogpressCopy.NEEDS_CONNECTION
                    return@launch
                }
                when (val answer = repository.createPost()) {
                    is ApiResult.Success -> {
                        sync()
                        onOpenEditor(answer.value)
                    }
                    is ApiResult.Failure -> notice = messageFor(answer.error, BlogpressCopy.PUBLISH_FAILED)
                }
            } finally {
                busy = false
            }
        }
    }

    fun bulkDelete() {
        val targets = visible.filter { selected.contains(it.clientId) }
        if (targets.isEmpty()) return
        scope.launch {
            targets.forEach { repository.deletePost(it.clientId) }
            selected = emptySet()
            sync()
        }
    }

    fun bulkOnline(publish: Boolean) {
        val targets = visible.filter { selected.contains(it.clientId) }
        if (targets.isEmpty()) return
        online(
            action = {
                var last: ApiResult<String> = ApiResult.Success("")
                for (row in targets) {
                    last =
                        if (publish) repository.publishPost(row.id)
                        else repository.unpublishPost(row.id)
                    if (last is ApiResult.Failure) break
                }
                last
            },
            failure = if (publish) BlogpressCopy.PUBLISH_FAILED else BlogpressCopy.UNPUBLISH_FAILED,
        )
        selected = emptySet()
    }

    Column(modifier = modifier.fillMaxSize().padding(horizontal = LocalRoySpacing.current.containerPadding)) {
        LazyColumn(
            modifier = Modifier.fillMaxSize().testTag("blogpress-list"),
            verticalArrangement = Arrangement.spacedBy(LocalRoySpacing.current.elementGapSm),
        ) {
            item {
                Row(
                    modifier = Modifier.fillMaxWidth().padding(top = LocalRoySpacing.current.sectionSm),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.SpaceBetween,
                ) {
                    Text(
                        text = BlogpressCopy.NEW_POST,
                        style = LocalRoyTypeScale.current.h5,
                        color = RoyColors.foreground,
                        modifier = Modifier.testTag("blogpress-title"),
                    )
                    Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                        TextButton(onClick = ::create, enabled = !busy) {
                            Icon(
                                imageVector =
                                    if (busy) LucideVectors.LoaderCircle
                                    else LucideVectors.Plus,
                                contentDescription = null,
                                modifier = Modifier.size(Recipes.Glyph.sm),
                            )
                            Spacer(Modifier.width(4.dp))
                            Text(if (busy) BlogpressCopy.CREATING_POST else BlogpressCopy.NEW_POST)
                        }
                    }
                }
            }

            if (signedIn) {
                pill?.let { current ->
                    item {
                        SyncPill(
                            state = current,
                            onRetry = {
                                scope.launch {
                                    repository.retryFailed()
                                    sync()
                                }
                            },
                        )
                    }
                }
            }

            notice?.let { message ->
                item {
                    Text(
                        text = message,
                        style = LocalRoyTypeScale.current.xs,
                        color = RoyColors.destructive,
                    )
                }
            }

            item {
                OutlinedTextField(
                    value = query,
                    onValueChange = { query = it },
                    placeholder = { Text(BlogpressCopy.SEARCH_PLACEHOLDER) },
                    leadingIcon = {
                        Icon(
                            imageVector = LucideVectors.Search,
                            contentDescription = null,
                        )
                    },
                    trailingIcon = {
                        if (query.isNotEmpty()) {
                            IconButton(onClick = { query = "" }) {
                                Icon(
                                    imageVector = LucideVectors.X,
                                    contentDescription = BlogpressCopy.CLEAR_SEARCH,
                                )
                            }
                        }
                    },
                    singleLine = true,
                    modifier =
                        Modifier.fillMaxWidth()
                            .testTag("blogpress-search")
                            .semantics { contentDescription = BlogpressCopy.SEARCH_ARIA },
                )
            }

            item {
                Row(
                    modifier = Modifier.fillMaxWidth().testTag("blogpress-filters"),
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                ) {
                    FilterChip(
                        selected = filter == "all",
                        onClick = { filter = "all" },
                        label = { Text(BlogpressCopy.FILTER_ALL) },
                        colors = filterChipColors(),
                    )
                    FilterChip(
                        selected = filter == "draft",
                        onClick = { filter = "draft" },
                        label = {
                            Text(
                                countLabel(
                                    BlogpressCopy.FILTER_DRAFT,
                                    posts.count { it.status == "draft" },
                                )
                            )
                        },
                        colors = filterChipColors(),
                    )
                    FilterChip(
                        selected = filter == "scheduled",
                        onClick = { filter = "scheduled" },
                        label = {
                            Text(
                                countLabel(
                                    BlogpressCopy.FILTER_SCHEDULED,
                                    posts.count { it.status == "scheduled" },
                                )
                            )
                        },
                        colors = filterChipColors(),
                    )
                    FilterChip(
                        selected = filter == "published",
                        onClick = { filter = "published" },
                        label = {
                            Text(
                                countLabel(
                                    BlogpressCopy.FILTER_PUBLISHED,
                                    posts.count { it.status == "published" },
                                )
                            )
                        },
                        colors = filterChipColors(),
                    )
                }
            }

            if (query.isNotEmpty()) {
                item {
                    Text(
                        text =
                            if (visible.isEmpty()) {
                                BlogpressCopy.SEARCH_NO_RESULTS
                            } else {
                                BlogpressCopy.SEARCH_FOUND.replace(
                                    "{count}",
                                    visible.size.toString(),
                                )
                            },
                        style = LocalRoyTypeScale.current.xs,
                        color = RoyColors.mutedForeground,
                    )
                }
            }

            if (posts.isNotEmpty()) {
                item {
                    BulkBar(
                        allSelected = visible.isNotEmpty() && selected.containsAll(visible.map { it.clientId }),
                        total = visible.size,
                        selected = visible.count { selected.contains(it.clientId) },
                        busy = busy,
                        onToggleAll = {
                            selected =
                                if (selected.containsAll(visible.map { it.clientId })) {
                                    emptySet()
                                } else {
                                    visible.map { it.clientId }.toSet()
                                }
                        },
                        onClear = { selected = emptySet() },
                        onPublish = { bulkOnline(true) },
                        onUnpublish = { bulkOnline(false) },
                        onDelete = { deletingBulk = true },
                    )
                }
            }

            if (visible.isEmpty()) {
                item {
                    EmptyList(
                        searching = query.isNotEmpty(),
                        filtered = filter != "all",
                        onCreate = ::create,
                    )
                }
            } else {
                items(visible, key = { it.clientId }) { row ->
                    PostRow(
                        row = row,
                        selected = selected.contains(row.clientId),
                        onToggle = {
                            selected =
                                if (selected.contains(row.clientId)) {
                                    selected - row.clientId
                                } else {
                                    selected + row.clientId
                                }
                        },
                        onOpenEditor = { onOpenEditor(row.id) },
                        onOpenPost = { onOpenPost(row.slug) },
                        onPublish = {
                            online(
                                { repository.publishPost(row.id) },
                                BlogpressCopy.PUBLISH_FAILED,
                            )
                        },
                        onPublishNow = {
                            online(
                                { repository.publishPost(row.id) },
                                BlogpressCopy.PUBLISH_NOW_FAILED,
                            )
                        },
                        onUnpublish = {
                            online(
                                { repository.unpublishPost(row.id) },
                                BlogpressCopy.UNPUBLISH_FAILED,
                            )
                        },
                        onToggleFeatured = {
                            online(
                                { repository.setFeatured(row.id, !row.featured) },
                                BlogpressCopy.FEATURE_FAILED,
                            )
                        },
                        onDuplicate = {
                            online(
                                {
                                    repository.duplicatePost(row.id).also {
                                        if (it is ApiResult.Success) {
                                            notice = BlogpressCopy.DUPLICATE_DONE
                                        }
                                    }
                                },
                                BlogpressCopy.DUPLICATE_FAILED,
                            )
                        },
                        onExportMarkdown = {
                            onExport(
                                PostText.label(row.content, row.metaDesc),
                                row.content,
                                "md",
                            )
                        },
                        onExportHtml = {
                            onExport(
                                PostText.label(row.content, row.metaDesc),
                                row.content,
                                "html",
                            )
                        },
                        onDelete = { deleting = row },
                    )
                }
            }

            undo?.let { removed ->
                item {
                    Surface(
                        color = RoyColors.muted,
                        shape = Recipes.Card.radius,
                        modifier = Modifier.fillMaxWidth().testTag("blogpress-undo"),
                    ) {
                        Row(
                            modifier = Modifier.fillMaxWidth().padding(12.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.SpaceBetween,
                        ) {
                            Text(
                                text = BlogpressCopy.DELETED,
                                style = LocalRoyTypeScale.current.xs,
                                color = RoyColors.foreground,
                            )
                            TextButton(
                                onClick = {
                                    scope.launch {
                                        repository.restorePost(removed.clientId)
                                        undo = null
                                        sync()
                                    }
                                }
                            ) {
                                Text(BlogpressCopy.UNDO)
                            }
                        }
                    }
                }
            }
        }
    }

    if (deletingBulk) {
        AlertDialog(
            onDismissRequest = { deletingBulk = false },
            title = { Text(BlogpressCopy.BULK_DELETE_TITLE) },
            text = {
                Text(
                    BlogpressCopy.BULK_DELETE_MESSAGE.replace(
                        "{count}",
                        visible.count { selected.contains(it.clientId) }.toString(),
                    )
                )
            },
            confirmButton = {
                TextButton(
                    onClick = {
                        deletingBulk = false
                        bulkDelete()
                    }
                ) {
                    Text(BlogpressCopy.BULK_DELETE)
                }
            },
            dismissButton = {
                TextButton(onClick = { deletingBulk = false }) {
                    Text(BlogpressCopy.CANCEL)
                }
            },
        )
    }

    deleting?.let { row ->
        val label = PostText.label(row.content, row.metaDesc)
        AlertDialog(
            onDismissRequest = { deleting = null },
            title = { Text(BlogpressCopy.DELETE_TITLE) },
            text = {
                Text(BlogpressCopy.DELETE_MESSAGE.replace("{label}", label))
            },
            confirmButton = {
                TextButton(
                    onClick = {
                        deleting = null
                        scope.launch {
                            if (repository.deletePost(row.clientId)) undo = row
                            sync()
                        }
                    }
                ) {
                    Text(BlogpressCopy.DELETE)
                }
            },
            dismissButton = {
                TextButton(onClick = { deleting = null }) { Text(BlogpressCopy.CANCEL) }
            },
        )
    }
}

@Composable
private fun BulkBar(
    allSelected: Boolean,
    total: Int,
    selected: Int,
    busy: Boolean,
    onToggleAll: () -> Unit,
    onClear: () -> Unit,
    onPublish: () -> Unit,
    onUnpublish: () -> Unit,
    onDelete: () -> Unit,
) {
    Surface(
        color = RoyColors.card,
        shape = Recipes.Card.radius,
        modifier = Modifier.fillMaxWidth().testTag("blogpress-bulk"),
    ) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(8.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            TextButton(onClick = onToggleAll) {
                Icon(
                    imageVector = LucideVectors.Check,
                    contentDescription = null,
                    modifier = Modifier.size(Recipes.Glyph.sm),
                    tint = if (allSelected) RoyColors.primary else RoyColors.mutedForeground,
                )
                Spacer(Modifier.width(4.dp))
                Text(BlogpressCopy.BULK_SELECT_ALL, style = LocalRoyTypeScale.current.xs)
            }
            Text(
                text =
                    if (selected == 0) {
                        BlogpressCopy.BULK_TOTAL.replace("{total}", total.toString())
                    } else {
                        BlogpressCopy.BULK_COUNT
                            .replace("{selected}", selected.toString())
                            .replace("{total}", total.toString())
                    },
                style = LocalRoyTypeScale.current.xs,
                color = RoyColors.mutedForeground,
            )
            Spacer(Modifier.weight(1f))
            TextButton(onClick = onClear, enabled = selected > 0 && !busy) {
                Text(BlogpressCopy.BULK_CLEAR, style = LocalRoyTypeScale.current.xs)
            }
            TextButton(onClick = onPublish, enabled = selected > 0 && !busy) {
                Icon(
                    imageVector = LucideVectors.Eye,
                    contentDescription = null,
                    modifier = Modifier.size(Recipes.Glyph.sm),
                )
                Spacer(Modifier.width(2.dp))
                Text(BlogpressCopy.BULK_PUBLISH, style = LocalRoyTypeScale.current.xs)
            }
            TextButton(onClick = onUnpublish, enabled = selected > 0 && !busy) {
                Icon(
                    imageVector = LucideVectors.EyeOff,
                    contentDescription = null,
                    modifier = Modifier.size(Recipes.Glyph.sm),
                )
                Spacer(Modifier.width(2.dp))
                Text(BlogpressCopy.BULK_UNPUBLISH, style = LocalRoyTypeScale.current.xs)
            }
            // The page's categories are a server read the offline shell does not
            // have, so the app draws the control and leaves it disabled rather
            // than offering a category it cannot name.
            TextButton(onClick = {}, enabled = false) {
                Icon(
                    imageVector = LucideVectors.FolderInput,
                    contentDescription = null,
                    modifier = Modifier.size(Recipes.Glyph.sm),
                )
                Spacer(Modifier.width(2.dp))
                Text(BlogpressCopy.BULK_CATEGORY, style = LocalRoyTypeScale.current.xs)
            }
            TextButton(onClick = onDelete, enabled = selected > 0 && !busy) {
                Icon(
                    imageVector = LucideVectors.Trash,
                    contentDescription = null,
                    modifier = Modifier.size(Recipes.Glyph.sm),
                    tint = RoyColors.destructive,
                )
                Spacer(Modifier.width(2.dp))
                Text(BlogpressCopy.BULK_DELETE, style = LocalRoyTypeScale.current.xs)
            }
        }
    }
}

@Composable
private fun PostRow(
    row: BlogpressPostRow,
    selected: Boolean,
    onToggle: () -> Unit,
    onOpenEditor: () -> Unit,
    onOpenPost: () -> Unit,
    onPublish: () -> Unit,
    onPublishNow: () -> Unit,
    onUnpublish: () -> Unit,
    onToggleFeatured: () -> Unit,
    onDuplicate: () -> Unit,
    onExportMarkdown: () -> Unit,
    onExportHtml: () -> Unit,
    onDelete: () -> Unit,
) {
    val type = LocalRoyTypeScale.current
    var menuOpen by remember { mutableStateOf(false) }
    val label = PostText.label(row.content, row.metaDesc)
    val words = wordCount(row.content)

    Surface(
        color = RoyColors.card,
        shape = Recipes.Card.radius,
        modifier = Modifier.fillMaxWidth().testTag("blogpress-row"),
    ) {
        Column(
            modifier = Modifier.fillMaxWidth().padding(Recipes.Card.padding(LocalRoySpacing.current)),
            verticalArrangement = Arrangement.spacedBy(LocalRoySpacing.current.elementGapSm),
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                IconButton(
                    onClick = onToggle,
                    modifier =
                        Modifier.semantics {
                            contentDescription =
                                if (selected) BlogpressCopy.DESELECT_POST
                                else BlogpressCopy.SELECT_POST
                        },
                ) {
                    Icon(
                        imageVector = LucideVectors.Check,
                        contentDescription = null,
                        tint = if (selected) RoyColors.primary else RoyColors.mutedForeground,
                        modifier = Modifier.size(Recipes.Glyph.sm),
                    )
                }

                Box(
                    modifier =
                        Modifier.size(40.dp)
                            .background(RoyColors.muted, RoundedCornerShape(12.dp)),
                    contentAlignment = Alignment.Center,
                ) {
                    Icon(
                        imageVector = LucideVectors.FileText,
                        contentDescription = null,
                        tint = RoyColors.primary,
                        modifier = Modifier.size(Recipes.Glyph.md),
                    )
                }

                Column(modifier = Modifier.weight(1f)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        if (row.featured) {
                            Icon(
                                imageVector = LucideVectors.Pin,
                                contentDescription = BlogpressCopy.PINNED,
                                tint = RoyColors.warning,
                                modifier = Modifier.size(Recipes.Glyph.sm),
                            )
                            Spacer(Modifier.width(4.dp))
                        }
                        Text(
                            text = label.ifEmpty { BlogpressCopy.UNTITLED },
                            style = type.small.copy(fontWeight = FontWeight.Bold),
                            color = RoyColors.foreground,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                    }
                    Text(
                        text = "/${row.slug}",
                        style = type.xs,
                        color = RoyColors.mutedForeground,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(6.dp),
                    ) {
                        Icon(
                            imageVector = LucideVectors.Clock,
                            contentDescription = null,
                            tint = RoyColors.mutedForeground,
                            modifier = Modifier.size(12.dp),
                        )
                        Text(
                            text = BlogpressCopy.WORD_COUNT.replace("{count}", words.toString()),
                            style = type.xs,
                            color = RoyColors.mutedForeground,
                        )
                        Icon(
                            imageVector = LucideVectors.Eye,
                            contentDescription = null,
                            tint = RoyColors.mutedForeground,
                            modifier = Modifier.size(12.dp),
                        )
                        Text(
                            text = row.viewCount.toString(),
                            style = type.xs,
                            color = RoyColors.mutedForeground,
                        )
                        Text(
                            text = dateLine(row),
                            style = type.xs,
                            color = RoyColors.mutedForeground,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                    }
                }

                StatusPill(row.status)

                Box {
                    IconButton(onClick = { menuOpen = true }) {
                        Icon(
                            imageVector = LucideVectors.Ellipsis,
                            contentDescription = BlogpressCopy.POST_ACTIONS,
                            tint = RoyColors.mutedForeground,
                            modifier = Modifier.size(Recipes.Glyph.md),
                        )
                    }
                    DropdownMenu(expanded = menuOpen, onDismissRequest = { menuOpen = false }) {
                        ActionItem(LucideVectors.PenLine, BlogpressCopy.ACTION_EDIT) {
                            menuOpen = false
                            onOpenEditor()
                        }
                        if (row.status == "published") {
                            ActionItem(LucideVectors.ExternalLink, BlogpressCopy.ACTION_VIEW) {
                                menuOpen = false
                                onOpenPost()
                            }
                        }
                        if (row.status == "draft") {
                            ActionItem(LucideVectors.Eye, BlogpressCopy.ACTION_PUBLISH) {
                                menuOpen = false
                                onPublish()
                            }
                        } else {
                            ActionItem(
                                if (row.status == "scheduled") LucideVectors.Eye
                                else LucideVectors.EyeOff,
                                if (row.status == "scheduled") BlogpressCopy.ACTION_PUBLISH_NOW
                                else BlogpressCopy.ACTION_UNPUBLISH,
                            ) {
                                menuOpen = false
                                if (row.status == "scheduled") onPublishNow() else onUnpublish()
                            }
                        }
                        ActionItem(
                            if (row.featured) LucideVectors.PinOff else LucideVectors.Pin,
                            if (row.featured) BlogpressCopy.ACTION_UNPIN else BlogpressCopy.ACTION_PIN,
                        ) {
                            menuOpen = false
                            onToggleFeatured()
                        }
                        ActionItem(LucideVectors.CopyPlus, BlogpressCopy.ACTION_DUPLICATE) {
                            menuOpen = false
                            onDuplicate()
                        }
                        ActionItem(LucideVectors.FileDown, BlogpressCopy.ACTION_EXPORT_MARKDOWN) {
                            menuOpen = false
                            onExportMarkdown()
                        }
                        ActionItem(LucideVectors.FileCodeCorner, BlogpressCopy.ACTION_EXPORT_HTML) {
                            menuOpen = false
                            onExportHtml()
                        }
                        HorizontalDivider(color = RoyColors.border.copy(alpha = 0.4f))
                        ActionItem(
                            LucideVectors.Trash,
                            BlogpressCopy.ACTION_DELETE,
                            destructive = true,
                        ) {
                            menuOpen = false
                            onDelete()
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun ActionItem(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    label: String,
    destructive: Boolean = false,
    onClick: () -> Unit,
) {
    DropdownMenuItem(
        text = {
            Text(
                text = label,
                style = LocalRoyTypeScale.current.xs,
                color = if (destructive) RoyColors.destructive else RoyColors.foreground,
            )
        },
        leadingIcon = {
            Icon(
                imageVector = icon,
                contentDescription = null,
                tint = if (destructive) RoyColors.destructive else RoyColors.mutedForeground,
                modifier = Modifier.size(Recipes.Glyph.sm),
            )
        },
        onClick = onClick,
    )
}

@Composable
private fun StatusPill(status: String) {
    val (label, color) =
        when (status) {
            "published" -> BlogpressCopy.STATUS_PUBLISHED to RoyColors.success
            "scheduled" -> BlogpressCopy.STATUS_SCHEDULED to RoyColors.info
            else -> BlogpressCopy.STATUS_DRAFT to RoyColors.warning
        }
    Surface(color = color.copy(alpha = 0.12f), shape = RoundedCornerShape(999.dp)) {
        Row(
            modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(4.dp),
        ) {
            Box(
                modifier =
                    Modifier.size(6.dp).background(color, CircleShape)
            )
            Text(text = label, style = LocalRoyTypeScale.current.xs, color = color)
        }
    }
}

@Composable
private fun EmptyList(searching: Boolean, filtered: Boolean, onCreate: () -> Unit) {
    Column(
        modifier = Modifier.fillMaxWidth().padding(vertical = LocalRoySpacing.current.sectionSm),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(LocalRoySpacing.current.elementGapSm),
    ) {
        Icon(
            imageVector = LucideVectors.FileText,
            contentDescription = null,
            tint = RoyColors.mutedForeground,
            modifier = Modifier.size(Recipes.Glyph.md),
        )
        Text(
            text = if (searching) BlogpressCopy.SEARCH_NO_RESULTS else BlogpressCopy.EMPTY_TITLE,
            style = LocalRoyTypeScale.current.h5,
            color = RoyColors.foreground,
        )
        Text(
            text =
                when {
                    searching -> BlogpressCopy.EMPTY_SEARCH_BODY
                    filtered -> BlogpressCopy.EMPTY_FILTER_BODY
                    else -> BlogpressCopy.EMPTY_ALL_BODY
                },
            style = LocalRoyTypeScale.current.xs,
            color = RoyColors.mutedForeground,
        )
        if (!searching && !filtered) {
            TextButton(onClick = onCreate) {
                Icon(
                    imageVector = LucideVectors.Plus,
                    contentDescription = null,
                    modifier = Modifier.size(Recipes.Glyph.sm),
                )
                Spacer(Modifier.width(4.dp))
                Text(BlogpressCopy.NEW_POST)
            }
        }
    }
}

@Composable
private fun filterChipColors() =
    FilterChipDefaults.filterChipColors(
        selectedContainerColor = RoyColors.primary.copy(alpha = 0.12f),
        selectedLabelColor = RoyColors.primary,
        labelColor = RoyColors.mutedForeground,
    )

private fun countLabel(label: String, count: Int): String =
    if (count == 0) label else "$label $count"

private fun wordCount(content: String): Int {
    val text = PostText.stripMarkdown(content)
    if (text.isEmpty()) return 0
    return text.split(Regex("[\\s\\u00A0\\uFEFF]+")).count { it.isNotEmpty() }
}

private fun dateLine(row: BlogpressPostRow): String =
    when (row.status) {
        "published" ->
            BlogpressCopy.PUBLISHED_ON.replace(
                "{date}",
                row.publishedAt?.let(BlogpressDates::dayLabel).orEmpty(),
            )
        "scheduled" ->
            BlogpressCopy.SCHEDULED_FOR.replace(
                "{date}",
                row.publishAt?.let(BlogpressDates::dayAndTimeLabel).orEmpty(),
            )
        else ->
            BlogpressCopy.LAST_MODIFIED.replace("{date}", BlogpressDates.dayLabel(row.updatedAt))
    }

private fun messageFor(error: ApiError, fallback: String): String =
    when (error) {
        is ApiError.Network -> "يتطلَّب الاتصال بالإنترنت. تحقَّق من اتِّصالك ثم أعد المحاولة."
        ApiError.NotSignedIn -> "سجِّل الدُّخول للمتابعة."
        is ApiError.Server -> serverMessage(error, fallback)
        is ApiError.InvalidContract -> "تعذَّر قراءة رد الخادم."
    }

private fun serverMessage(error: ApiError.Server, fallback: String): String {
    val named =
        runCatching {
                Json.parseToJsonElement(error.detail).jsonObject["error"]?.jsonPrimitive?.content
            }
            .getOrNull()
    return named?.takeIf { it.isNotBlank() } ?: fallback
}
