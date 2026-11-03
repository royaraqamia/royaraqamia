package com.royaraqamia.app.chats

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.ExtendedFloatingActionButton
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.royaraqamia.app.contracts.ApiError
import com.royaraqamia.app.contracts.ApiResult
import com.royaraqamia.app.contracts.generated.ChatThreadsResponseThreadsItem
import com.royaraqamia.app.contracts.generated.ChatThreadsResponseThreadsItemKind
import com.royaraqamia.app.contracts.generated.ChatThreadsResponseThreadsItemLastMessageSenderKind
import com.royaraqamia.app.contracts.generated.ChatThreadsResponseThreadsItemMyStatus
import com.royaraqamia.app.contracts.generated.ChatThreadsResponseThreadsItemStatus
import androidx.compose.foundation.shape.RoundedCornerShape
import com.royaraqamia.app.shared.NeedsConnection
import com.royaraqamia.app.shared.NeedsConnectionState
import com.royaraqamia.app.shared.ReadFailureNotice
import com.royaraqamia.app.shared.ReadFailureState
import com.royaraqamia.app.theme.LocalRoySpacing
import com.royaraqamia.app.theme.LocalRoyTypeScale
import com.royaraqamia.app.theme.Recipes
import com.royaraqamia.app.theme.RoyColors
import com.royaraqamia.app.ui.vectors.LucideVectors
import kotlinx.coroutines.launch

/**
 * The notification centre's Chats tab, as a screen (#819).
 *
 * It is the app's half of `frontend/ui/chats/chats-panel.tsx`: the same count
 * line, the same assistant row and its locked face, the same requests waiting on
 * this member with their two answers, the same rows with their last line, time
 * and unread badge, and the same empty state. Every sentence comes from
 * [ChatsListCopy], generated from the file the site's module is generated from.
 *
 * The assistant's row is **locked** rather than offered when the plan allows no
 * turn (`allowance.member.cap == 0`, the server's own answer). A row that opens a
 * thread which refuses every question is a control that lies.
 *
 * The floating action opens the site's new-conversation screen: the member picker
 * and the group form are their own surface (`/chats/new`), and the app opens it
 * as the document until that is ported.
 */
@Composable
fun ChatsScreen(
    repository: ChatsRepository,
    modifier: Modifier = Modifier,
    onOpenThread: (String) -> Unit = {},
    onOpenAssistant: (String) -> Unit = {},
    onNewChat: () -> Unit = {},
    onUpgrade: () -> Unit = {},
) {
    val scope = rememberCoroutineScope()

    var state by remember { mutableStateOf<ChatsUiState?>(null) }
    var attempts by remember { mutableStateOf(0) }
    var failure by remember { mutableStateOf<String?>(null) }
    var assistantLocked by remember { mutableStateOf(false) }
    var assistantBusy by remember { mutableStateOf(false) }
    var answering by remember { mutableStateOf<Answering?>(null) }
    var busy by remember { mutableStateOf(false) }

    LaunchedEffect(repository, attempts) {
        state = null
        failure = null

        state =
            when (val result = repository.threads()) {
                is ApiResult.Success -> {
                    // The lock is the server's answer, not a guess: one read says
                    // what today's allowance is, and a failed read leaves the row
                    // offered — the thread's own refusal is then the sentence.
                    assistantLocked = assistantLockedNow(repository)
                    ChatsUiState.of(result.value)
                }
                is ApiResult.Failure ->
                    ChatsUiState.Unavailable(offline = result.error is ApiError.Network)
            }
    }

    /** A request's answer: the dialog asks, this sends, and the list reads again. */
    fun answer(thread: ChatThreadsResponseThreadsItem, accept: Boolean) {
        if (busy) return
        scope.launch {
            busy = true
            failure =
                when (val result = repository.respond(thread.id, accept)) {
                    is ApiResult.Success -> {
                        attempts += 1
                        null
                    }
                    is ApiResult.Failure ->
                        ChatFailure.sentenceOf(result.error) ?: ChatThreadCopy.REQUEST_FAILED
                }
            busy = false
            answering = null
        }
    }

    fun openAssistant() {
        if (assistantBusy || assistantLocked) return
        scope.launch {
            assistantBusy = true
            when (val result = repository.startAssistant()) {
                is ApiResult.Success -> {
                    val id = result.value.conversationId
                    if (id != null) onOpenAssistant(id) else failure = ChatsListCopy.ASSISTANT_FAILED
                }
                is ApiResult.Failure ->
                    failure = ChatFailure.sentenceOf(result.error) ?: ChatsListCopy.ASSISTANT_FAILED
            }
            assistantBusy = false
        }
    }

    Box(modifier = modifier.fillMaxSize()) {
        when (val shown = state) {
            null -> ChatsSkeleton()
            ChatsUiState.Empty -> EmptyChats()
            is ChatsUiState.Unavailable ->
                Unavailable(offline = shown.offline, onRetry = { attempts += 1 })
            is ChatsUiState.Live ->
                ChatsList(
                    threads = shown.threads,
                    assistantLocked = assistantLocked,
                    assistantBusy = assistantBusy,
                    failure = failure,
                    onAnswer = { thread, accept -> answering = Answering(thread, accept) },
                    onOpenAssistant = ::openAssistant,
                    onUpgrade = onUpgrade,
                    onOpenThread = onOpenThread,
                    onNewChat = onNewChat,
                )
        }
    }

    val pending = answering
    if (pending != null) {
        val accept = pending.accept
        AlertDialog(
            onDismissRequest = { if (!busy) answering = null },
            title = {
                Text(
                    text =
                        if (accept) ChatsListCopy.CONFIRM_ACCEPT_TITLE
                        else ChatsListCopy.CONFIRM_DECLINE_TITLE,
                    style = LocalRoyTypeScale.current.h3.copy(fontWeight = FontWeight.Bold),
                )
            },
            text = {
                Text(
                    text = answerSentence(pending.thread, accept),
                    style = LocalRoyTypeScale.current.small,
                )
            },
            confirmButton = {
                TextButton(onClick = { answer(pending.thread, accept) }, enabled = !busy) {
                    Text(
                        text = if (accept) ChatsListCopy.ACCEPT else ChatsListCopy.DECLINE,
                        style = LocalRoyTypeScale.current.small.copy(fontWeight = FontWeight.Bold),
                    )
                }
            },
            dismissButton = {
                TextButton(onClick = { answering = null }, enabled = !busy) {
                    Text(text = ChatsListCopy.CANCEL, style = LocalRoyTypeScale.current.small)
                }
            },
            containerColor = RoyColors.card,
        )
    }

}

/** What the dialog is asking about. */
private data class Answering(val thread: ChatThreadsResponseThreadsItem, val accept: Boolean)

/** The sentence a confirm dialog shows: a direct request and an invitation differ. */
private fun answerSentence(thread: ChatThreadsResponseThreadsItem, accept: Boolean): String {
    val group = thread.kind == ChatThreadsResponseThreadsItemKind.GROUP
    return when {
        accept && group -> ChatsListCopy.ACCEPT_GROUP_MESSAGE.replace("{title}", thread.title)
        accept -> ChatsListCopy.ACCEPT_DIRECT_MESSAGE.replace("{title}", thread.title)
        group -> ChatsListCopy.DECLINE_GROUP_MESSAGE
        else -> ChatsListCopy.DECLINE_DIRECT_MESSAGE
    }
}

/** The assistant's allowance, as the row's lock reads it. */
private suspend fun assistantLockedNow(repository: ChatsRepository): Boolean =
    when (val state = repository.assistant()) {
        is ApiResult.Success -> state.value.allowance?.member?.cap == 0.0
        is ApiResult.Failure -> false
    }

/** The rows, the requests above them, and the one action that starts a chat. */
@Composable
private fun ChatsList(
    threads: List<ChatThreadsResponseThreadsItem>,
    assistantLocked: Boolean,
    assistantBusy: Boolean,
    failure: String?,
    onAnswer: (ChatThreadsResponseThreadsItem, Boolean) -> Unit,
    onOpenAssistant: () -> Unit,
    onUpgrade: () -> Unit,
    onOpenThread: (String) -> Unit,
    onNewChat: () -> Unit,
) {
    val spacing = LocalRoySpacing.current
    val type = LocalRoyTypeScale.current

    val pending =
        threads.filter {
            it.myStatus == ChatThreadsResponseThreadsItemMyStatus.REQUESTED ||
                it.myStatus == ChatThreadsResponseThreadsItemMyStatus.INVITED
        }
    val open =
        threads.filter {
            it.myStatus == ChatThreadsResponseThreadsItemMyStatus.ACTIVE ||
                it.myStatus == ChatThreadsResponseThreadsItemMyStatus.DECLINED
        }
    val hasAssistant = threads.any { it.kind == ChatThreadsResponseThreadsItemKind.AGENT }

    Box(modifier = Modifier.fillMaxSize()) {
        LazyColumn(
            modifier = Modifier.fillMaxSize(),
            contentPadding =
                PaddingValues(
                    start = spacing.containerPadding,
                    end = spacing.containerPadding,
                    top = spacing.elementGapSm,
                    // Room for the floating action, which is the list's only
                    // primary control and never a row inside it.
                    bottom = spacing.section,
                ),
            verticalArrangement = Arrangement.spacedBy(spacing.elementGapSm),
        ) {
            item {
                Text(
                    text =
                        if (threads.isEmpty()) {
                            ChatsListCopy.NO_THREADS
                        } else {
                            ChatsListCopy.THREAD_COUNT.replace("{count}", threads.size.toString())
                        },
                    style = type.xs.copy(fontWeight = FontWeight.Medium),
                    color = RoyColors.mutedForeground,
                )
            }

            if (failure != null) {
                item {
                    Text(
                        text = failure,
                        style = type.xs.copy(fontWeight = FontWeight.Medium),
                        color = RoyColors.destructive,
                        modifier =
                            Modifier.fillMaxWidth()
                                .background(
                                    RoyColors.destructive.copy(alpha = 0.1f),
                                    RoundedCornerShape(12.dp),
                                )
                                .padding(horizontal = spacing.elementGapSm, vertical = spacing.elementGapSm),
                    )
                }
            }

            if (!hasAssistant) {
                item {
                    AssistantRow(
                        locked = assistantLocked,
                        busy = assistantBusy,
                        onOpen = onOpenAssistant,
                        onUpgrade = onUpgrade,
                    )
                }
            }

            if (pending.isNotEmpty()) {
                item {
                    SectionLabel(text = ChatsListCopy.REQUESTS_LABEL)
                }
                items(pending, key = { it.id }) { thread ->
                    RequestRow(thread = thread, onAnswer = onAnswer)
                }
            }

            if (open.isNotEmpty()) {
                item {
                    Column(
                        modifier =
                            Modifier.fillMaxWidth()
                                .border(1.dp, RoyColors.border.copy(alpha = 0.7f), Recipes.Card.radius)
                                .background(Recipes.Card.container, Recipes.Card.radius)
                    ) {
                        open.forEachIndexed { index, thread ->
                            if (index > 0) {
                                HorizontalDivider(color = RoyColors.border.copy(alpha = 0.4f))
                            }
                            ThreadRow(thread = thread, onOpen = onOpenThread)
                        }
                    }
                }
            } else if (pending.isEmpty()) {
                item { EmptyChats() }
            }
        }

        ExtendedFloatingActionButton(
            onClick = onNewChat,
            modifier =
                Modifier.align(Alignment.BottomEnd).padding(spacing.containerPadding),
            containerColor = RoyColors.primary,
            contentColor = RoyColors.primaryForeground,
            icon = {
                Icon(
                    imageVector = LucideVectors.Plus,
                    contentDescription = null,
                    modifier = Modifier.size(Recipes.Glyph.md),
                )
            },
            text = {
                Text(
                    text = ChatsListCopy.NEW_CHAT,
                    style = type.small.copy(fontWeight = FontWeight.Bold),
                )
            },
        )
    }
}

/** The assistant's row: offered, or locked with the way to unlock it. */
@Composable
private fun AssistantRow(
    locked: Boolean,
    busy: Boolean,
    onOpen: () -> Unit,
    onUpgrade: () -> Unit,
) {
    val type = LocalRoyTypeScale.current
    val spacing = LocalRoySpacing.current

    Row(
        modifier =
            Modifier.fillMaxWidth()
                .border(1.dp, RoyColors.border.copy(alpha = 0.7f), Recipes.Card.radius)
                .background(Recipes.Card.container, Recipes.Card.radius)
                .clickable(enabled = !locked && !busy) { if (locked) Unit else onOpen() }
                .padding(spacing.cardPadding),
        horizontalArrangement = Arrangement.spacedBy(spacing.elementGapSm),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            modifier =
                Modifier.size(36.dp)
                    .background(
                        if (locked) RoyColors.muted.copy(alpha = 0.6f)
                        else RoyColors.primary.copy(alpha = 0.1f),
                        CircleShape,
                    ),
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                imageVector = LucideVectors.Sparkles,
                contentDescription = null,
                tint = if (locked) RoyColors.mutedForeground else RoyColors.primary,
                modifier = Modifier.size(Recipes.Glyph.sm),
            )
        }

        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = ChatsListCopy.ASSISTANT_TITLE,
                style = type.small.copy(fontWeight = FontWeight.Bold),
                color = RoyColors.foreground,
            )
            Text(
                text = if (locked) ChatsListCopy.ASSISTANT_LOCKED else ChatsListCopy.ASSISTANT_BODY,
                style = type.xs,
                color = RoyColors.mutedForeground,
                modifier = Modifier.padding(top = spacing.elementGapSm / 2),
            )
        }

        if (locked) {
            Text(
                text = ChatsListCopy.ASSISTANT_UPGRADE,
                style = type.xs.copy(fontWeight = FontWeight.Bold),
                color = RoyColors.primary,
                modifier = Modifier.clickable(onClick = onUpgrade),
            )
        }
    }
}

/** A request waiting on this member, with the two answers it can be given. */
@Composable
private fun RequestRow(
    thread: ChatThreadsResponseThreadsItem,
    onAnswer: (ChatThreadsResponseThreadsItem, Boolean) -> Unit,
) {
    val type = LocalRoyTypeScale.current
    val spacing = LocalRoySpacing.current

    Column(
        modifier =
            Modifier.fillMaxWidth()
                .border(1.dp, RoyColors.primary.copy(alpha = 0.2f), Recipes.Card.radius)
                .background(RoyColors.primary.copy(alpha = 0.05f), Recipes.Card.radius)
                .padding(spacing.cardPadding),
        verticalArrangement = Arrangement.spacedBy(spacing.elementGapSm),
    ) {
        Row(horizontalArrangement = Arrangement.spacedBy(spacing.elementGapSm)) {
            GroupMark(dimmed = false)
            Column {
                Text(
                    text = thread.title,
                    style = type.small.copy(fontWeight = FontWeight.Bold),
                    color = RoyColors.foreground,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                Text(
                    text =
                        if (thread.myStatus == ChatThreadsResponseThreadsItemMyStatus.INVITED) {
                            ChatsListCopy.REQUEST_GROUP
                        } else {
                            ChatsListCopy.REQUEST_DIRECT
                        },
                    style = type.xs,
                    color = RoyColors.mutedForeground,
                )
            }
        }

        Row(horizontalArrangement = Arrangement.spacedBy(spacing.elementGapSm)) {
            Row(
                modifier =
                    Modifier.background(RoyColors.primary, RoundedCornerShape(8.dp))
                        .clickable { onAnswer(thread, true) }
                        .padding(horizontal = spacing.elementGapSm, vertical = 6.dp),
                horizontalArrangement = Arrangement.spacedBy(6.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Icon(
                    imageVector = LucideVectors.Check,
                    contentDescription = null,
                    tint = RoyColors.primaryForeground,
                    modifier = Modifier.size(14.dp),
                )
                Text(
                    text = ChatsListCopy.ACCEPT,
                    style = type.xs.copy(fontWeight = FontWeight.Bold),
                    color = RoyColors.primaryForeground,
                )
            }

            Row(
                modifier =
                    Modifier.border(1.dp, RoyColors.border.copy(alpha = 0.7f), RoundedCornerShape(8.dp))
                        .clickable { onAnswer(thread, false) }
                        .padding(horizontal = spacing.elementGapSm, vertical = 6.dp),
                horizontalArrangement = Arrangement.spacedBy(6.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Icon(
                    imageVector = LucideVectors.X,
                    contentDescription = null,
                    tint = RoyColors.mutedForeground,
                    modifier = Modifier.size(14.dp),
                )
                Text(
                    text = ChatsListCopy.DECLINE,
                    style = type.xs.copy(fontWeight = FontWeight.Bold),
                    color = RoyColors.mutedForeground,
                )
            }
        }
    }
}

/** One open conversation: its identity, its last line, its time and its badge. */
@Composable
private fun ThreadRow(
    thread: ChatThreadsResponseThreadsItem,
    onOpen: (String) -> Unit,
) {
    val type = LocalRoyTypeScale.current
    val spacing = LocalRoySpacing.current

    Row(
        modifier =
            Modifier.fillMaxWidth()
                .clickable { onOpen(thread.id) }
                .padding(horizontal = spacing.cardPadding, vertical = spacing.elementGapSm + 2.dp),
        horizontalArrangement = Arrangement.spacedBy(spacing.elementGapSm),
        verticalAlignment = Alignment.Top,
    ) {
        GroupMark(dimmed = thread.kind != ChatThreadsResponseThreadsItemKind.GROUP)

        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = thread.title,
                style = type.small.copy(fontWeight = FontWeight.Bold),
                color = RoyColors.foreground,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            Text(
                text = previewOf(thread),
                style = type.xs,
                color = RoyColors.mutedForeground,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.padding(top = spacing.elementGapSm / 2),
            )
        }

        Column(horizontalAlignment = Alignment.End) {
            if (thread.lastMessageAt != null) {
                Text(
                    text = ChatText.timeAgo(thread.lastMessageAt),
                    style = type.xs,
                    color = RoyColors.mutedForeground.copy(alpha = 0.6f),
                    maxLines = 1,
                )
            }
            val unread = thread.unreadCount.toInt()
            if (unread > 0) {
                Box(
                    modifier =
                        Modifier.padding(top = spacing.elementGapSm / 2)
                            .size(width = 20.dp, height = 20.dp)
                            .background(RoyColors.primary, CircleShape),
                    contentAlignment = Alignment.Center,
                ) {
                    Text(
                        text =
                            if (unread > UNREAD_MAX) ChatsListCopy.UNREAD_OVERFLOW
                            else unread.toString(),
                        style = type.xs.copy(fontWeight = FontWeight.Bold),
                        color = RoyColors.primaryForeground,
                    )
                }
            }
        }
    }
}

/** The line under a row's title: the tombstone, the file, or the last words. */
private fun previewOf(thread: ChatThreadsResponseThreadsItem): String {
    val line = thread.lastMessage
    if (thread.status == ChatThreadsResponseThreadsItemStatus.DECLINED) {
        return ChatsListCopy.DECLINED_LABEL
    }
    if (line == null) return ChatsListCopy.NO_MESSAGES
    if (line.hasAttachments && line.body.isNullOrBlank()) return ChatsListCopy.ATTACHMENT_ONLY
    val prefix =
        if (line.senderKind == ChatThreadsResponseThreadsItemLastMessageSenderKind.AGENT) {
            ChatsListCopy.AGENT_PREFIX
        } else {
            ""
        }
    return (prefix + (line.body ?: "")).trim()
}

/** A group is a room rather than one member's face, so it draws the site's glyph. */
@Composable
private fun GroupMark(dimmed: Boolean) {
    Box(
        modifier =
            Modifier.size(36.dp)
                .border(1.dp, RoyColors.border.copy(alpha = 0.4f), CircleShape)
                .background(
                    if (dimmed) RoyColors.muted.copy(alpha = 0.6f) else RoyColors.muted.copy(alpha = 0.3f),
                    CircleShape,
                ),
        contentAlignment = Alignment.Center,
    ) {
        Icon(
            imageVector = LucideVectors.Users,
            contentDescription = null,
            tint = RoyColors.mutedForeground.copy(alpha = 0.8f),
            modifier = Modifier.size(Recipes.Glyph.sm),
        )
    }
}

@Composable
private fun SectionLabel(text: String) {
    Text(
        text = text,
        style = LocalRoyTypeScale.current.xs.copy(fontWeight = FontWeight.Bold),
        color = RoyColors.mutedForeground,
    )
}

/** Nothing yet: the site's glyph, its title and its sentence. */
@Composable
private fun EmptyChats() {
    val type = LocalRoyTypeScale.current
    val spacing = LocalRoySpacing.current

    Column(
        modifier =
            Modifier.fillMaxWidth()
                .padding(vertical = spacing.section),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(spacing.elementGapSm),
    ) {
        Box(
            modifier =
                Modifier.size(56.dp)
                    .background(RoyColors.muted.copy(alpha = 0.5f), CircleShape),
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                imageVector = LucideVectors.MessagesSquare,
                contentDescription = null,
                tint = RoyColors.mutedForeground,
                modifier = Modifier.size(Recipes.Glyph.md),
            )
        }
        Text(
            text = ChatsListCopy.EMPTY_TITLE,
            style = type.small.copy(fontWeight = FontWeight.Bold),
            color = RoyColors.foreground,
            textAlign = TextAlign.Center,
        )
        Text(
            text = ChatsListCopy.EMPTY_BODY,
            style = type.xs,
            color = RoyColors.mutedForeground,
            textAlign = TextAlign.Center,
        )
    }
}

/** Nothing to show: an unreachable server, or one that refused the read. */
@Composable
private fun Unavailable(offline: Boolean, onRetry: () -> Unit) {
    Column(
        modifier =
            Modifier.fillMaxSize()
                .padding(LocalRoySpacing.current.containerPadding),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        if (offline) {
            NeedsConnection(
                message = ChatsListCopy.LIST_ERROR,
                state = NeedsConnectionState.Block,
                onRetry = onRetry,
            )
        } else {
            ReadFailureNotice(
                message = ChatsListCopy.LIST_ERROR,
                state = ReadFailureState.Failed,
                onRetry = onRetry,
            )
        }
    }
}

/**
 * The loading face: the site's card shape, empty, while the read is out.
 *
 * It is not a state in [ChatsUiState] because there is no sentence to say while
 * nothing is known, and a spinner is not one either.
 */
@Composable
private fun ChatsSkeleton() {
    val spacing = LocalRoySpacing.current

    Column(
        modifier =
            Modifier.fillMaxSize()
                .padding(
                    horizontal = spacing.containerPadding,
                    vertical = spacing.elementGapSm,
                ),
        verticalArrangement = Arrangement.spacedBy(spacing.elementGapSm),
    ) {
        repeat(3) {
            Box(
                modifier =
                    Modifier.fillMaxWidth()
                        .height(64.dp)
                        .background(Recipes.Skeleton.fill, Recipes.Skeleton.radius),
            )
        }
    }
}

/** The site's own ceiling for a badge; past it the row says `99+`. */
private const val UNREAD_MAX = 99
