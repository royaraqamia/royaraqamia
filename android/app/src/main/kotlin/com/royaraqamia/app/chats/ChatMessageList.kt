package com.royaraqamia.app.chats

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListState
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.royaraqamia.app.assistant.AssistantPanelCopy
import com.royaraqamia.app.assistant.AssistantSource
import com.royaraqamia.app.community.CommunityMarkdown
import com.royaraqamia.app.contracts.generated.ChatMessagePageResponseMessagesItem
import com.royaraqamia.app.contracts.generated.ChatMessagePageResponseMessagesItemSenderKind
import com.royaraqamia.app.contracts.generated.ChatThreadResponseThread
import com.royaraqamia.app.theme.LocalRoySpacing
import com.royaraqamia.app.theme.LocalRoyTypeScale
import com.royaraqamia.app.theme.RoyColors
import com.royaraqamia.app.theme.RoyTypeScale
import com.royaraqamia.app.ui.vectors.LucideVectors
import java.time.Duration
import java.time.Instant

/**
 * What the outbox is doing with one of the member's lines (#1033).
 *
 * `Sent` is every line the server already holds, and every line the app has not
 * queued. The words are `ChatThreadCopy`'s, the same file the site reads, so a
 * queued line cannot be worded twice.
 */
enum class MessagePending {
    Sent,
    Queued,
    Failed,
}

/**
 * One conversation, drawn the same way wherever it is read (#1562).
 *
 * The conversation's screen and the floating assistant sheet (ADR-0143) are two
 * doors into one thread, so they are one list: the rows, the days between them,
 * the older page above them and the line that is still on its way are all here.
 * A surface owns only its frame — the intro above an empty conversation, the
 * trailing content below the newest line, and the composer.
 *
 * The scroll contract is part of the list, because it is what the two screens
 * would otherwise disagree about. A new line, or an answer being written, walks
 * to the end **only while the reader is already there**; an older page keeps the
 * line they were reading where it was.
 */
@Composable
fun ChatMessageList(
    thread: ChatThreadResponseThread?,
    messages: List<ChatMessagePageResponseMessagesItem>,
    mine: (ChatMessagePageResponseMessagesItem) -> Boolean,
    onDownload: (String) -> Unit,
    pending: (ChatMessagePageResponseMessagesItem) -> MessagePending = {
        MessagePending.Sent
    },
    editing: String? = null,
    editText: String = "",
    onEditStart: (ChatMessagePageResponseMessagesItem) -> Unit = {},
    onEditText: (String) -> Unit = {},
    onEditCancel: () -> Unit = {},
    onEditSave: (ChatMessagePageResponseMessagesItem) -> Unit = {},
    onDelete: (ChatMessagePageResponseMessagesItem) -> Unit = {},
    onRetry: (ChatMessagePageResponseMessagesItem) -> Unit = {},
    hasOlder: Boolean = false,
    onLoadOlder: () -> Unit = {},
    /** What a line with no words says; the assistant's sheet names it. */
    emptyBody: String? = null,
    /** What the newest answer changes: a streamed token, a pending phase. */
    followKey: Any? = messages.size,
    listState: LazyListState = rememberLazyListState(),
    modifier: Modifier = Modifier,
    contentPadding: PaddingValues = PaddingValues(vertical = 8.dp),
    intro: (@Composable () -> Unit)? = null,
    trailing: (@Composable () -> Unit)? = null,
) {
    val spacing = LocalRoySpacing.current
    val type = LocalRoyTypeScale.current

    /**
     * The line the reader was looking at when they asked for an older page, and
     * its offset: after the page arrives the list scrolls back to that key rather
     * than to an index, which is stable whatever the page carried.
     */
    var anchorKey by remember { mutableStateOf<Any?>(null) }
    var anchorOffset by remember { mutableIntStateOf(0) }

    val atBottom by remember {
        derivedStateOf {
            val info = listState.layoutInfo
            val last = info.visibleItemsInfo.lastOrNull()
            // One line of slack: a new message is already in the list when the
            // effect runs, so the reader's "at the bottom" is one item behind.
            last == null || info.totalItemsCount == 0 || last.index >= info.totalItemsCount - 2
        }
    }

    LaunchedEffect(messages.firstOrNull()?.id) {
        val key = anchorKey ?: return@LaunchedEffect
        val index = messages.indexOfFirst { it.id == key }
        anchorKey = null
        if (index >= 0) listState.scrollToItem(index, anchorOffset)
    }

    LaunchedEffect(followKey) {
        if (anchorKey != null) return@LaunchedEffect
        if (!atBottom) return@LaunchedEffect
        val target = listState.layoutInfo.totalItemsCount - 1
        if (target >= 0) listState.scrollToItem(target)
    }

    LazyColumn(
        state = listState,
        modifier = modifier,
        contentPadding = contentPadding,
        verticalArrangement = Arrangement.spacedBy(spacing.elementGapSm),
    ) {
        if (hasOlder) {
            item(key = "older") {
                TextButton(
                    onClick = {
                        val info = listState.layoutInfo.visibleItemsInfo.firstOrNull()
                        anchorKey = info?.key
                        anchorOffset = info?.offset ?: 0
                        onLoadOlder()
                    },
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Text(
                        text = ChatThreadCopy.LOAD_OLDER,
                        style = type.xs.copy(fontWeight = FontWeight.Medium),
                        color = RoyColors.primary,
                    )
                }
            }
        }

        if (messages.isEmpty() && intro != null) {
            item(key = "intro") { intro() }
        }

        itemsIndexed(messages, key = { _, message -> message.id }) { index, message ->
            Column {
                if (ChatText.isNewDay(messages.getOrNull(index - 1)?.createdAt, message.createdAt)) {
                    DaySeparator(at = message.createdAt)
                }
                MessageRow(
                    thread = thread,
                    message = message,
                    mine = mine(message),
                    editing = editing == message.id,
                    editText = editText,
                    onEditStart = { onEditStart(message) },
                    onEditText = onEditText,
                    onEditCancel = onEditCancel,
                    onEditSave = { onEditSave(message) },
                    onDownload = onDownload,
                    onDelete = { onDelete(message) },
                    pending = pending(message),
                    onRetry = { onRetry(message) },
                    emptyBody = emptyBody,
                )
            }
        }

        if (trailing != null) {
            item(key = "trailing") { trailing() }
        }
    }
}

/** One line: its bubble, its attachments, and what the line says about itself. */
@Composable
private fun MessageRow(
    thread: ChatThreadResponseThread?,
    message: ChatMessagePageResponseMessagesItem,
    mine: Boolean,
    editing: Boolean,
    editText: String,
    onEditStart: () -> Unit,
    onEditText: (String) -> Unit,
    onEditCancel: () -> Unit,
    onEditSave: () -> Unit,
    onDownload: (String) -> Unit,
    onDelete: () -> Unit,
    pending: MessagePending = MessagePending.Sent,
    onRetry: () -> Unit = {},
    emptyBody: String? = null,
) {
    val type = LocalRoyTypeScale.current
    val spacing = LocalRoySpacing.current
    val deleted = message.deletedAt != null
    val settled = pending == MessagePending.Sent
    val editable = mine && !deleted && settled && withinEditWindow(message.createdAt)
    val receipt = thread?.let { ChatText.receiptOf(it, message.createdAt, mine, deleted) }

    Column(
        modifier = Modifier.fillMaxWidth(),
        horizontalAlignment = if (mine) Alignment.End else Alignment.Start,
    ) {
        Column(
            modifier =
                Modifier.fillMaxWidth(0.85f)
                    .background(
                        if (mine) RoyColors.primary else RoyColors.muted,
                        RoundedCornerShape(
                            topStart = 16.dp,
                            topEnd = 16.dp,
                            bottomStart = if (mine) 16.dp else 6.dp,
                            bottomEnd = if (mine) 6.dp else 16.dp,
                        ),
                    )
                    .padding(horizontal = spacing.elementGapSm, vertical = 6.dp),
        ) {
            when {
                deleted ->
                    Text(
                        text = ChatThreadCopy.DELETED_MESSAGE,
                        style = type.xs,
                        color =
                            if (mine) {
                                RoyColors.primaryForeground.copy(alpha = 0.7f)
                            } else {
                                RoyColors.mutedForeground
                            },
                    )
                editing ->
                    Column(verticalArrangement = Arrangement.spacedBy(spacing.elementGapSm / 2)) {
                        OutlinedTextField(
                            value = editText,
                            onValueChange = onEditText,
                            modifier = Modifier.fillMaxWidth(),
                            label = { Text(text = ChatThreadCopy.EDIT_LABEL, style = type.xs) },
                        )
                        Row(horizontalArrangement = Arrangement.spacedBy(spacing.elementGapSm)) {
                            TextButton(onClick = onEditCancel) {
                                Text(text = ChatThreadCopy.CANCEL, style = type.xs)
                            }
                            TextButton(onClick = onEditSave) {
                                Icon(
                                    imageVector = LucideVectors.Check,
                                    contentDescription = null,
                                    modifier = Modifier.size(12.dp),
                                )
                                Text(
                                    text = ChatThreadCopy.SAVE,
                                    style = type.xs.copy(fontWeight = FontWeight.Bold),
                                )
                            }
                        }
                    }
                else ->
                    Text(
                        // The same marks the site draws (ADR-0193): the body is
                        // markdown, and `CommunityMarkdown.inline` is the app's
                        // one inline renderer.
                        text = remember(message.body, emptyBody) {
                            if (message.body.isNullOrBlank() && emptyBody != null) {
                                AnnotatedString(emptyBody)
                            } else {
                                CommunityMarkdown.inline(message.body.orEmpty())
                            }
                        },
                        style = type.small,
                        color = if (mine) RoyColors.primaryForeground else RoyColors.foreground,
                    )
            }

            if (message.senderKind == ChatMessagePageResponseMessagesItemSenderKind.AGENT &&
                !message.sources.isNullOrEmpty()
            ) {
                WebSourcesCard(
                    sources = message.sources!!.map {
                        AssistantSource(it.url, it.title, it.domain, it.publishedDate)
                    },
                    type = type,
                    readNote = message.body?.let { !Regex("\\[\\d{1,2}\\]").containsMatchIn(it) }
                        ?: true,
                )
            }

            if (message.attachments.isNotEmpty() && !deleted) {
                message.attachments.forEach { attachment ->
                    Row(
                        modifier =
                            Modifier.fillMaxWidth()
                                .clickable { onDownload(attachment.id) }
                                .padding(top = 2.dp),
                        horizontalArrangement = Arrangement.spacedBy(4.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Text(
                            text = attachment.fileName,
                            style = type.xs,
                            color = if (mine) RoyColors.primaryForeground else RoyColors.foreground,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                    }
                }
            }
        }

        Row(
            horizontalArrangement = Arrangement.spacedBy(6.dp),
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier.padding(top = 2.dp),
        ) {
            when (pending) {
                MessagePending.Queued -> {
                    Icon(
                        imageVector = LucideVectors.Clock,
                        contentDescription = null,
                        tint = RoyColors.mutedForeground.copy(alpha = 0.6f),
                        modifier = Modifier.size(12.dp),
                    )
                    Text(
                        text = ChatThreadCopy.QUEUED,
                        style = type.xs,
                        color = RoyColors.mutedForeground.copy(alpha = 0.6f),
                    )
                }

                MessagePending.Failed -> {
                    Icon(
                        imageVector = LucideVectors.CircleAlert,
                        contentDescription = null,
                        tint = RoyColors.destructive,
                        modifier = Modifier.size(12.dp),
                    )
                    Text(
                        text = ChatThreadCopy.SEND_FAILED,
                        style = type.xs,
                        color = RoyColors.destructive,
                    )
                    TextButton(onClick = onRetry, contentPadding = PaddingValues(0.dp)) {
                        Text(
                            text = ChatThreadCopy.RETRY,
                            style = type.xs,
                            fontWeight = FontWeight.Bold,
                            color = RoyColors.destructive,
                        )
                    }
                }

                MessagePending.Sent -> Unit
            }
            Text(
                text = ChatText.timeAgo(message.createdAt),
                style = type.xs,
                color = RoyColors.mutedForeground.copy(alpha = 0.6f),
            )
            if (message.editedAt != null && !deleted) {
                Text(
                    text = "· ${ChatThreadCopy.EDITED}",
                    style = type.xs,
                    color = RoyColors.mutedForeground.copy(alpha = 0.6f),
                )
            }
            if (receipt != null) {
                Text(
                    text = "· $receipt",
                    style = type.xs,
                    color = RoyColors.mutedForeground.copy(alpha = 0.6f),
                )
            }
            if (mine && !deleted && settled) {
                if (editable) {
                    IconButton(
                        onClick = onEditStart,
                        modifier = Modifier.size(20.dp),
                    ) {
                        Icon(
                            imageVector = LucideVectors.Pencil,
                            contentDescription = ChatThreadCopy.EDIT_LABEL,
                            tint = RoyColors.mutedForeground,
                            modifier = Modifier.size(12.dp),
                        )
                    }
                }
                IconButton(onClick = onDelete, modifier = Modifier.size(20.dp)) {
                    Icon(
                        imageVector = LucideVectors.Trash,
                        contentDescription = ChatThreadCopy.DELETE_LABEL,
                        tint = RoyColors.mutedForeground,
                        modifier = Modifier.size(12.dp),
                    )
                }
            }
        }
    }
}

@Composable
private fun DaySeparator(at: String) {
    Text(
        text = ChatText.dayOf(at),
        style = LocalRoyTypeScale.current.xs.copy(fontWeight = FontWeight.Medium),
        color = RoyColors.mutedForeground.copy(alpha = 0.8f),
        textAlign = TextAlign.Center,
        modifier = Modifier.fillMaxWidth().padding(vertical = 2.dp),
    )
}

/** The site's edit window, mirrored by the RLS policy. */
private val EDIT_WINDOW: Duration = Duration.ofMinutes(15)

/** Whether the line is still inside the window a member may edit it in. */
private fun withinEditWindow(createdAtIso: String): Boolean {
    val createdAt = runCatching { Instant.parse(createdAtIso) }.getOrNull() ?: return false
    return Duration.between(createdAt, Instant.now()) < EDIT_WINDOW
}

/**
 * What a web answer was read from (ADR-0206), under the reply in both clients.
 * The numbers match the markers the server put in the answer; the row itself is
 * the link, so a citation is one press away.
 */
@Composable
internal fun WebSourcesCard(
    sources: List<AssistantSource>,
    type: RoyTypeScale,
    readNote: Boolean = false,
) {
    if (sources.isEmpty()) return
    Column(
        modifier =
            Modifier.fillMaxWidth()
                .background(RoyColors.mutedForeground.copy(alpha = 0.06f), RoundedCornerShape(10.dp))
                .padding(8.dp),
        verticalArrangement = Arrangement.spacedBy(3.dp),
    ) {
        Text(
            text = AssistantPanelCopy.SOURCES_TITLE,
            style = type.xs.copy(fontWeight = FontWeight.Bold),
            color = RoyColors.foreground,
        )
        if (readNote) {
            Text(
                text = AssistantPanelCopy.SOURCES_READ,
                style = type.xs,
                color = RoyColors.mutedForeground,
            )
        }
        sources.forEachIndexed { index, source ->
            Row(
                horizontalArrangement = Arrangement.spacedBy(4.dp),
                verticalAlignment = Alignment.Top,
            ) {
                Text(
                    text = "[${index + 1}]",
                    style = type.xs,
                    color = RoyColors.mutedForeground,
                )
                Column(Modifier.weight(1f)) {
                    Text(
                        text = source.title.ifBlank { source.domain },
                        style = type.xs,
                        color = RoyColors.foreground,
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis,
                    )
                    Text(
                        text = source.domain,
                        style = type.xs,
                        color = RoyColors.mutedForeground,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
                Icon(
                    imageVector = LucideVectors.ExternalLink,
                    contentDescription = null,
                    tint = RoyColors.mutedForeground,
                    modifier = Modifier.size(12.dp),
                )
            }
        }
    }
}

