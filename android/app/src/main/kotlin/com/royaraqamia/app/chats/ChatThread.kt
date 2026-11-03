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
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
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
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import coil.compose.AsyncImage
import com.royaraqamia.app.contracts.ApiError
import com.royaraqamia.app.contracts.ApiResult
import com.royaraqamia.app.contracts.generated.ChatMessagePageResponseMessagesItem
import com.royaraqamia.app.contracts.generated.ChatThreadResponseThread
import com.royaraqamia.app.contracts.generated.ChatThreadResponseThreadKind
import com.royaraqamia.app.contracts.generated.ChatThreadResponseThreadMeStatus
import com.royaraqamia.app.contracts.generated.ChatThreadResponseThreadParticipantsItem
import com.royaraqamia.app.contracts.generated.ChatThreadResponseThreadParticipantsItemStatus
import com.royaraqamia.app.contracts.generated.ChatThreadResponseThreadStatus
import com.royaraqamia.app.shared.NeedsConnection
import com.royaraqamia.app.shared.NeedsConnectionState
import com.royaraqamia.app.shared.ReadFailureNotice
import com.royaraqamia.app.shared.ReadFailureState
import com.royaraqamia.app.theme.LocalRoySpacing
import com.royaraqamia.app.theme.LocalRoyTypeScale
import com.royaraqamia.app.theme.Recipes
import com.royaraqamia.app.theme.RoyColors
import com.royaraqamia.app.ui.vectors.LucideVectors
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import java.time.Duration
import java.time.Instant

/**
 * `/chats/[id]`, as a screen (#819).
 *
 * It is the app's half of `frontend/ui/chats/chat-thread-view.tsx`: the same
 * header and menu, the same group roster and its invite panel, the same bubbles
 * with their day separators, edited marker, attachment chips and read receipt,
 * and the same six footer faces — answer, waiting, blocked, closed, write and the
 * one that says why nothing can be written. Every sentence comes from
 * [ChatThreadCopy] or [ChatsListCopy], generated from the files the site's modules
 * come from.
 *
 * **Nothing is cached and nothing is composed offline.** A message needs the
 * network, and the thread says so when the read fails; `perf/surfaces.json` gives
 * this surface `needs-connection` for the same reason (ADR-0113).
 *
 * **The assistant's thread is the document.** It is Pro-only, it streams an
 * answer rather than reading one, and its own stage ports it; an agent thread
 * here hands its route back to the shell ([onOpenAssistantThread]) instead of
 * drawing a second, worse conversation.
 */
@Composable
fun ChatThread(
    conversationId: String,
    repository: ChatsRepository,
    modifier: Modifier = Modifier,
    onOpenAttachment: (String) -> Unit = {},
    onOpenAssistantThread: (String) -> Unit = {},
) {
    val scope = rememberCoroutineScope()

    var read by remember { mutableStateOf<ChatThreadUiState?>(null) }
    var messages by remember { mutableStateOf<List<ChatMessagePageResponseMessagesItem>>(emptyList()) }
    var attempts by remember { mutableStateOf(0) }
    var failure by remember { mutableStateOf<String?>(null) }
    var sending by remember { mutableStateOf(false) }
    var draft by remember { mutableStateOf("") }
    var menuOpen by remember { mutableStateOf(false) }
    var dialog by remember { mutableStateOf<ChatDialog?>(null) }
    var busy by remember { mutableStateOf(false) }
    var editing by remember { mutableStateOf<String?>(null) }
    var editingText by remember { mutableStateOf("") }
    var inviting by remember { mutableStateOf(false) }
    var inviteQuery by remember { mutableStateOf("") }
    var inviteResults by remember {
        mutableStateOf<List<com.royaraqamia.app.contracts.generated.ChatMembersResponseMembersItem>>(emptyList())
    }
    var invited by remember { mutableStateOf<Set<String>>(emptySet()) }

    /** One read of the thread and its lines, and the read watermark it stamps. */
    suspend fun load(): Boolean {
        when (val result = repository.thread(conversationId)) {
            is ApiResult.Success -> {
                if (result.value.kind == ChatThreadResponseThreadKind.AGENT) {
                    // Handed over, and stoppable: a poll that kept running under
                    // the document would open it again every few seconds.
                    onOpenAssistantThread(conversationId)
                    return false
                }
                read = ChatThreadUiState.Live(result.value)
                when (val page = repository.messages(conversationId)) {
                    is ApiResult.Success -> {
                        messages = page.value.messages
                        // Seen is stamped once per arrival, the way the site's hook
                        // does: the badge is the reader's watermark (#816).
                        if (page.value.messages.isNotEmpty()) repository.markRead(conversationId)
                    }
                    is ApiResult.Failure ->
                        failure = ChatFailure.sentenceOf(page.error) ?: ChatThreadCopy.LOAD_FAILED
                }
            }
            is ApiResult.Failure -> {
                // Only the first read decides the face: a poll that fails while a
                // thread is drawn must not replace it with an error.
                if (read == null) {
                    val missing = (result.error as? ApiError.Server)?.status == NOT_FOUND
                    read =
                        if (missing) {
                            ChatThreadUiState.Missing
                        } else {
                            ChatThreadUiState.Unavailable(offline = result.error is ApiError.Network)
                        }
                }
            }
        }
        return true
    }

    /**
     * The read, and then the same read again every few seconds.
     *
     * The site pulls on a Realtime hint; the app has no socket, so it asks again
     * on a bounded interval while the thread is on screen. The observable promise
     * is the same one — a line the peer sent appears without a reload — and the
     * mechanism is the one this client can keep (a Realtime client is its own
     * stage, not a line in a screen).
     */
    LaunchedEffect(repository, conversationId, attempts) {
        while (load()) {
            delay(POLL_MS)
        }
    }

    /** One write's outcome, as the alert the screen shows. */
    suspend fun report(result: ApiResult<Unit>, fallback: String) {
        failure =
            when (result) {
                is ApiResult.Success -> null
                is ApiResult.Failure -> ChatFailure.sentenceOf(result.error) ?: fallback
            }
        if (result is ApiResult.Success) attempts += 1
    }

    fun send() {
        val text = draft.trim()
        if (text.isEmpty() || sending) return
        scope.launch {
            sending = true
            when (val result = repository.send(conversationId, text)) {
                is ApiResult.Success -> {
                    draft = ""
                    failure = null
                    load()
                }
                is ApiResult.Failure ->
                    failure =
                        ChatFailure.sentenceOf(result.error) ?: ChatThreadCopy.REQUEST_FAILED
            }
            sending = false
        }
    }

    Box(modifier = modifier.fillMaxSize()) {
        when (val shown = read) {
            null -> ThreadSkeleton()
            ChatThreadUiState.Missing -> MissingThread()
            is ChatThreadUiState.Unavailable ->
                UnavailableThread(offline = shown.offline, onRetry = { attempts += 1 })
            is ChatThreadUiState.Live ->
                ThreadBody(
                    thread = shown.thread,
                    messages = messages,
                    draft = draft,
                    sending = sending,
                    failure = failure,
                    menuOpen = menuOpen,
                    editing = editing,
                    editingText = editingText,
                    inviting = inviting,
                    inviteQuery = inviteQuery,
                    inviteResults = inviteResults,
                    invited = invited,
                    onDraft = { draft = it },
                    onSend = ::send,
                    onMenu = { menuOpen = it },
                    onDialog = { menuOpen = false; dialog = it },
                    onEditStart = { message ->
                        editing = message.id
                        editingText = message.body.orEmpty()
                    },
                    onEditText = { editingText = it },
                    onEditCancel = { editing = null },
                    onEditSave = { message ->
                        scope.launch {
                            when (val result = repository.edit(message.id, editingText.trim())) {
                                is ApiResult.Success -> {
                                    editing = null
                                    failure = null
                                    load()
                                }
                                is ApiResult.Failure ->
                                    failure =
                                        ChatFailure.sentenceOf(result.error)
                                            ?: ChatThreadCopy.REQUEST_FAILED
                            }
                        }
                    },
                    onDownload = { attachmentId ->
                        scope.launch {
                            when (val result = repository.attachmentUrl(conversationId, attachmentId)) {
                                is ApiResult.Success ->
                                    result.value.url?.let { onOpenAttachment(it) }
                                is ApiResult.Failure ->
                                    failure =
                                        ChatFailure.sentenceOf(result.error)
                                            ?: ChatThreadCopy.DOWNLOAD_FAILED
                            }
                        }
                    },
                    onInviteOpen = {
                        inviting = true
                        inviteQuery = ""
                        inviteResults = emptyList()
                        invited = emptySet()
                    },
                    onInviteClose = { inviting = false },
                    onInviteQuery = { query ->
                        inviteQuery = query
                        if (query.trim().length >= 2) {
                            scope.launch {
                                inviteResults =
                                    when (val result = repository.members(query)) {
                                        is ApiResult.Success -> result.value
                                        is ApiResult.Failure -> emptyList()
                                    }
                            }
                        } else {
                            inviteResults = emptyList()
                        }
                    },
                    onInviteToggle = { peerId ->
                        invited =
                            if (invited.contains(peerId)) invited - peerId else invited + peerId
                    },
                    onInviteSubmit = {
                        scope.launch {
                            busy = true
                            val result = repository.invite(conversationId, invited.toList())
                            busy = false
                            if (result is ApiResult.Success) {
                                inviting = false
                                invited = emptySet()
                            }
                            report(result, ChatThreadCopy.REQUEST_FAILED)
                        }
                    },
                    onRespond = { accept -> dialog = ChatDialog.Respond(accept) },
                    onWithdraw = { dialog = ChatDialog.Withdraw },
                    onRequest = {
                        scope.launch {
                            busy = true
                            val result = repository.request(conversationId)
                            busy = false
                            report(result, ChatThreadCopy.REQUEST_FAILED)
                        }
                    },
                    onUnblock = { peerId ->
                        scope.launch {
                            busy = true
                            val result = repository.unblock(peerId)
                            busy = false
                            report(result, ChatThreadCopy.REQUEST_FAILED)
                        }
                    },
                )
        }
    }

    val asking = dialog
    if (asking != null) {
        ChatDialogCard(
            dialog = asking,
            conversationId = conversationId,
            repository = repository,
            busy = busy,
            thread = (read as? ChatThreadUiState.Live)?.thread,
            onBusy = { busy = it },
            onDone = { attempts += 1; dialog = null },
            onFailure = { failure = it },
            onDismiss = { dialog = null },
        )
    }
}

/** One footer face, derived from the thread the server answered. */
private enum class ThreadFace { ANSWER, WAITING, BLOCKED, CLOSED, WRITE, INACTIVE }

private fun faceOf(thread: ChatThreadResponseThread): ThreadFace {
    val mine = thread.me?.status
    val closed =
        thread.status == ChatThreadResponseThreadStatus.DECLINED ||
            thread.status == ChatThreadResponseThreadStatus.ARCHIVED

    if (closed) return ThreadFace.CLOSED
    if (thread.status == ChatThreadResponseThreadStatus.REQUESTED) {
        return if (
            mine == ChatThreadResponseThreadMeStatus.REQUESTED ||
                mine == ChatThreadResponseThreadMeStatus.INVITED
        ) {
            ThreadFace.ANSWER
        } else {
            ThreadFace.WAITING
        }
    }
    if (thread.blockedByMe) return ThreadFace.BLOCKED
    if (thread.canWrite) return ThreadFace.WRITE
    return ThreadFace.INACTIVE
}

/** What the assistant's thread says: it is the document, so the app says so. */
private const val NOT_FOUND = 404

/** How often the open thread asks again. The site's socket is the difference. */
private const val POLL_MS = 5_000L

/** The site's edit window (`CHAT_EDIT_WINDOW_MS`), mirrored by the RLS policy. */
private val EDIT_WINDOW: Duration = Duration.ofMinutes(15)

private sealed interface ChatDialog {
    data class Respond(val accept: Boolean) : ChatDialog

    data object Withdraw : ChatDialog

    data object Block : ChatDialog

    data object Leave : ChatDialog

    data class Delete(val messageId: String) : ChatDialog
}

/** The conversation, once the server has answered it. */
@Composable
private fun ThreadBody(
    thread: ChatThreadResponseThread,
    messages: List<ChatMessagePageResponseMessagesItem>,
    draft: String,
    sending: Boolean,
    failure: String?,
    menuOpen: Boolean,
    editing: String?,
    editingText: String,
    inviting: Boolean,
    inviteQuery: String,
    inviteResults: List<com.royaraqamia.app.contracts.generated.ChatMembersResponseMembersItem>,
    invited: Set<String>,
    onDraft: (String) -> Unit,
    onSend: () -> Unit,
    onMenu: (Boolean) -> Unit,
    onDialog: (ChatDialog) -> Unit,
    onEditStart: (ChatMessagePageResponseMessagesItem) -> Unit,
    onEditText: (String) -> Unit,
    onEditCancel: () -> Unit,
    onEditSave: (ChatMessagePageResponseMessagesItem) -> Unit,
    onDownload: (String) -> Unit,
    onInviteOpen: () -> Unit,
    onInviteClose: () -> Unit,
    onInviteQuery: (String) -> Unit,
    onInviteToggle: (String) -> Unit,
    onInviteSubmit: () -> Unit,
    onRespond: (Boolean) -> Unit,
    onWithdraw: () -> Unit,
    onRequest: () -> Unit,
    onUnblock: (String) -> Unit,
) {
    val spacing = LocalRoySpacing.current
    val listState = rememberLazyListState()
    val face = faceOf(thread)
    val counterpart = ChatText.counterpartOf(thread)

    LaunchedEffect(messages.size) {
        if (messages.isNotEmpty()) listState.animateScrollToItem(messages.lastIndex)
    }

    Column(
        modifier =
            Modifier.fillMaxSize()
                .border(1.dp, RoyColors.border.copy(alpha = 0.6f), Recipes.Card.radius)
                .background(Recipes.Card.container, Recipes.Card.radius)
    ) {
        ThreadHeader(
            thread = thread,
            counterpart = counterpart?.username,
            menuOpen = menuOpen,
            onMenu = onMenu,
            onBlock = { onDialog(ChatDialog.Block) },
            onLeave = { onDialog(ChatDialog.Leave) },
        )

        if (thread.kind == ChatThreadResponseThreadKind.GROUP) {
            Roster(
                thread = thread,
                inviting = inviting,
                query = inviteQuery,
                results = inviteResults,
                selected = invited,
                onOpen = onInviteOpen,
                onClose = onInviteClose,
                onQuery = onInviteQuery,
                onToggle = onInviteToggle,
                onSubmit = onInviteSubmit,
            )
        }

        if (failure != null) {
            Text(
                text = failure,
                style = LocalRoyTypeScale.current.xs.copy(fontWeight = FontWeight.Medium),
                color = RoyColors.foreground.copy(alpha = 0.8f),
                modifier =
                    Modifier.fillMaxWidth()
                        .background(RoyColors.muted.copy(alpha = 0.4f))
                        .padding(horizontal = spacing.elementGapSm, vertical = spacing.elementGapSm),
            )
        }

        LazyColumn(
            state = listState,
            modifier = Modifier.weight(1f).fillMaxWidth(),
            contentPadding = PaddingValues(horizontal = spacing.elementGapSm, vertical = spacing.elementGapSm),
            verticalArrangement = Arrangement.spacedBy(spacing.elementGapSm),
        ) {
            if (messages.isEmpty()) {
                item { Intro(thread = thread, face = face) }
            }

            itemsIndexed(messages, key = { _, message -> message.id }) { index, message ->
                Column {
                    if (ChatText.isNewDay(messages.getOrNull(index - 1)?.createdAt, message.createdAt)) {
                        DaySeparator(at = message.createdAt)
                    }
                    MessageRow(
                        thread = thread,
                        message = message,
                        mine = message.senderId != null && message.senderId == thread.me?.userId,
                        editing = editing == message.id,
                        editText = editingText,
                        onEditStart = { onEditStart(message) },
                        onEditText = onEditText,
                        onEditCancel = onEditCancel,
                        onEditSave = { onEditSave(message) },
                        onDownload = onDownload,
                        onDelete = { onDialog(ChatDialog.Delete(message.id)) },
                    )
                }
            }
        }

        Footer(
            thread = thread,
            face = face,
            counterpart = counterpart,
            draft = draft,
            sending = sending,
            onDraft = onDraft,
            onSend = onSend,
            onRespond = onRespond,
            onWithdraw = { onDialog(ChatDialog.Withdraw) },
            onRequest = onRequest,
            onUnblock = onUnblock,
        )
    }
}

/**
 * The header: who this is, the roster's count or the peer's handle, and the menu.
 *
 * A group is a room rather than one member's face, so it draws the site's glyph
 * (ADR-0100) — never a hand-drawn shape standing in for an avatar.
 */
@Composable
private fun ThreadHeader(
    thread: ChatThreadResponseThread,
    counterpart: String?,
    menuOpen: Boolean,
    onMenu: (Boolean) -> Unit,
    onBlock: () -> Unit,
    onLeave: () -> Unit,
) {
    val type = LocalRoyTypeScale.current
    val spacing = LocalRoySpacing.current

    Row(
        modifier =
            Modifier.fillMaxWidth()
                .padding(horizontal = spacing.elementGapSm, vertical = spacing.elementGapSm),
        horizontalArrangement = Arrangement.spacedBy(spacing.elementGapSm),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (thread.kind == ChatThreadResponseThreadKind.GROUP) {
            Box(
                modifier =
                    Modifier.size(36.dp)
                        .clip(CircleShape)
                        .background(RoyColors.muted.copy(alpha = 0.6f)),
                contentAlignment = Alignment.Center,
            ) {
                Icon(
                    imageVector = LucideVectors.Users,
                    contentDescription = null,
                    tint = RoyColors.mutedForeground,
                    modifier = Modifier.size(Recipes.Glyph.sm),
                )
            }
        } else {
            Avatar(
                name = thread.counterpart?.name ?: thread.counterpart?.username ?: thread.title,
                url = thread.counterpart?.avatarUrl,
            )
        }

        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = thread.title,
                style = type.small.copy(fontWeight = FontWeight.Bold),
                color = RoyColors.foreground,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            Text(
                text =
                    if (thread.kind == ChatThreadResponseThreadKind.DIRECT && counterpart != null) {
                        "@$counterpart"
                    } else {
                        ChatThreadCopy.MEMBERS_COUNT.replace(
                            "{count}",
                            ChatText.membersOf(thread).size.toString(),
                        )
                    },
                style = type.xs,
                color = RoyColors.mutedForeground.copy(alpha = 0.7f),
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }

        Box {
            IconButton(onClick = { onMenu(!menuOpen) }) {
                Icon(
                    imageVector = LucideVectors.EllipsisVertical,
                    contentDescription = ChatThreadCopy.OPTIONS,
                    tint = RoyColors.mutedForeground,
                    modifier = Modifier.size(18.dp),
                )
            }

            DropdownMenu(expanded = menuOpen, onDismissRequest = { onMenu(false) }) {
                if (thread.counterpart != null) {
                    DropdownMenuItem(
                        text = {
                            Text(
                                text =
                                    ChatThreadCopy.BLOCK_USER.replace(
                                        "{username}",
                                        thread.counterpart?.username.orEmpty(),
                                    ),
                                style = type.xs.copy(fontWeight = FontWeight.Medium),
                                color = RoyColors.destructive,
                            )
                        },
                        onClick = onBlock,
                    )
                }
                if (thread.kind == ChatThreadResponseThreadKind.GROUP) {
                    DropdownMenuItem(
                        text = {
                            Text(
                                text = ChatThreadCopy.LEAVE,
                                style = type.xs.copy(fontWeight = FontWeight.Medium),
                                color = RoyColors.destructive,
                            )
                        },
                        onClick = onLeave,
                    )
                }
            }
        }
    }

    HorizontalDivider(color = RoyColors.border.copy(alpha = 0.4f))
}

/** A group's roster and the invite panel that adds to it. */
@Composable
private fun Roster(
    thread: ChatThreadResponseThread,
    inviting: Boolean,
    query: String,
    results: List<com.royaraqamia.app.contracts.generated.ChatMembersResponseMembersItem>,
    selected: Set<String>,
    onOpen: () -> Unit,
    onClose: () -> Unit,
    onQuery: (String) -> Unit,
    onToggle: (String) -> Unit,
    onSubmit: () -> Unit,
) {
    val type = LocalRoyTypeScale.current
    val spacing = LocalRoySpacing.current
    val members = ChatText.membersOf(thread)
    val canInvite = thread.me?.status == ChatThreadResponseThreadMeStatus.ACTIVE

    Column(
        modifier =
            Modifier.fillMaxWidth()
                .padding(horizontal = spacing.elementGapSm, vertical = spacing.elementGapSm),
        verticalArrangement = Arrangement.spacedBy(spacing.elementGapSm),
    ) {
        LazyRow(horizontalArrangement = Arrangement.spacedBy(spacing.elementGapSm)) {
            items(members, key = { it.userId }) { participant ->
                MemberChip(participant = participant)
            }
            if (canInvite) {
                item {
                    Row(
                        modifier =
                            Modifier.border(1.dp, RoyColors.border.copy(alpha = 0.7f), CircleShape)
                                .clickable(onClick = onOpen)
                                .padding(horizontal = spacing.elementGapSm, vertical = 4.dp),
                        horizontalArrangement = Arrangement.spacedBy(4.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Icon(
                            imageVector = LucideVectors.UserPlus,
                            contentDescription = null,
                            tint = RoyColors.primary,
                            modifier = Modifier.size(13.dp),
                        )
                        Text(
                            text = ChatThreadCopy.ADD,
                            style = type.xs.copy(fontWeight = FontWeight.Bold),
                            color = RoyColors.primary,
                        )
                    }
                }
            }
        }

        if (inviting) {
            Column(
                modifier =
                    Modifier.border(
                            1.dp,
                            RoyColors.border.copy(alpha = 0.6f),
                            RoundedCornerShape(12.dp),
                        )
                        .padding(spacing.elementGapSm),
                verticalArrangement = Arrangement.spacedBy(spacing.elementGapSm),
            ) {
                OutlinedTextField(
                    value = query,
                    onValueChange = onQuery,
                    singleLine = true,
                    label = { Text(text = ChatThreadCopy.ADD_MEMBERS, style = type.xs) },
                    modifier = Modifier.fillMaxWidth(),
                )

                results.forEach { peer ->
                    Row(
                        modifier = Modifier.fillMaxWidth().clickable { onToggle(peer.id) },
                        horizontalArrangement = Arrangement.spacedBy(spacing.elementGapSm),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Text(
                            text = peer.name ?: peer.username,
                            style = type.xs,
                            color =
                                if (selected.contains(peer.id)) RoyColors.primary
                                else RoyColors.foreground,
                            modifier = Modifier.weight(1f),
                        )
                        Text(
                            text = "@${peer.username}",
                            style = type.xs,
                            color = RoyColors.mutedForeground,
                        )
                    }
                }

                Row(
                    horizontalArrangement = Arrangement.spacedBy(spacing.elementGapSm),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    IconButton(onClick = onClose, modifier = Modifier.size(24.dp)) {
                        Icon(
                            imageVector = LucideVectors.X,
                            contentDescription = ChatThreadCopy.CANCEL,
                            tint = RoyColors.mutedForeground,
                            modifier = Modifier.size(12.dp),
                        )
                    }
                    Text(
                        text =
                            ChatThreadCopy.ROSTER_COUNT
                                .replace("{count}", members.size.toString())
                                .replace("{max}", MAX_GROUP_MEMBERS.toString()),
                        style = type.xs,
                        color = RoyColors.mutedForeground.copy(alpha = 0.7f),
                        modifier = Modifier.weight(1f),
                    )
                    TextButton(onClick = onClose) {
                        Text(text = ChatThreadCopy.CANCEL, style = type.xs)
                    }
                    TextButton(onClick = onSubmit, enabled = selected.isNotEmpty()) {
                        Text(
                            text = ChatThreadCopy.INVITE,
                            style = type.xs.copy(fontWeight = FontWeight.Bold),
                        )
                    }
                }
            }
        }
    }

    HorizontalDivider(color = RoyColors.border.copy(alpha = 0.4f))
}

/** One member of a group's roster: a face, a name, and what their seat is. */
@Composable
private fun MemberChip(participant: ChatThreadResponseThreadParticipantsItem) {
    val type = LocalRoyTypeScale.current
    val spacing = LocalRoySpacing.current
    val name = ChatText.nameOf(participant)

    Row(
        modifier =
            Modifier.background(RoyColors.muted.copy(alpha = 0.5f), CircleShape)
                .padding(horizontal = 8.dp, vertical = 4.dp),
        horizontalArrangement = Arrangement.spacedBy(4.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            text = name,
            style = type.xs.copy(fontWeight = FontWeight.Medium),
            color = RoyColors.foreground.copy(alpha = 0.8f),
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.width(88.dp),
        )
        if (participant.role.name == "OWNER") {
            Text(text = ChatThreadCopy.OWNER, style = type.xs, color = RoyColors.mutedForeground)
        }
        if (participant.status == ChatThreadResponseThreadParticipantsItemStatus.INVITED) {
            Text(text = ChatThreadCopy.INVITED, style = type.xs, color = RoyColors.mutedForeground)
        }
    }
}

/** The empty thread: who this is, and what can happen next. */
@Composable
private fun Intro(thread: ChatThreadResponseThread, face: ThreadFace) {
    val type = LocalRoyTypeScale.current
    val spacing = LocalRoySpacing.current

    val note =
        when (face) {
            ThreadFace.ANSWER ->
                if (thread.kind == ChatThreadResponseThreadKind.GROUP) {
                    ChatThreadCopy.INVITE_GROUP.replace("{title}", thread.title)
                } else {
                    ChatThreadCopy.INVITE_DIRECT.replace("{title}", thread.title)
                }
            ThreadFace.WAITING -> ChatThreadCopy.WAITING_THREAD
            ThreadFace.CLOSED ->
                if (thread.status == ChatThreadResponseThreadStatus.DECLINED) {
                    ChatThreadCopy.CLOSED_DECLINED
                } else {
                    ChatThreadCopy.CLOSED_ARCHIVED
                }
            ThreadFace.BLOCKED -> ChatThreadCopy.BLOCKED_THREAD
            ThreadFace.WRITE, ThreadFace.INACTIVE -> ChatThreadCopy.EMPTY_THREAD
        }

    Column(
        modifier = Modifier.fillMaxWidth().padding(vertical = spacing.sectionSm),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(spacing.elementGapSm),
    ) {
        Text(
            text = thread.title,
            style = type.small.copy(fontWeight = FontWeight.Bold),
            color = RoyColors.foreground,
            textAlign = TextAlign.Center,
        )
        Text(
            text = note,
            style = type.xs,
            color = RoyColors.mutedForeground,
            textAlign = TextAlign.Center,
        )
    }
}

/** One line: its bubble, its attachments, and what the line says about itself. */
@Composable
private fun MessageRow(
    thread: ChatThreadResponseThread,
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
) {
    val type = LocalRoyTypeScale.current
    val spacing = LocalRoySpacing.current
    val deleted = message.deletedAt != null
    val editable =
        mine && !deleted && withinEditWindow(message.createdAt)
    val receipt = ChatText.receiptOf(thread, message.createdAt, mine, deleted)

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
                        color = if (mine) RoyColors.primaryForeground.copy(alpha = 0.7f) else RoyColors.mutedForeground,
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
                        text = message.body.orEmpty(),
                        style = type.small,
                        color = if (mine) RoyColors.primaryForeground else RoyColors.foreground,
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
                        Icon(
                            imageVector = LucideVectors.Download,
                            contentDescription =
                                ChatThreadCopy.DOWNLOAD_FILE.replace(
                                    "{name}",
                                    attachment.fileName,
                                ),
                            tint = if (mine) RoyColors.primaryForeground else RoyColors.foreground,
                            modifier = Modifier.size(12.dp),
                        )
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
            if (mine && !deleted) {
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

/** The bottom of the screen: six faces, and each says what can happen next. */
@Composable
private fun Footer(
    thread: ChatThreadResponseThread,
    face: ThreadFace,
    counterpart: com.royaraqamia.app.contracts.generated.ChatThreadResponseThreadParticipantsItemPeer?,
    draft: String,
    sending: Boolean,
    onDraft: (String) -> Unit,
    onSend: () -> Unit,
    onRespond: (Boolean) -> Unit,
    onWithdraw: () -> Unit,
    onRequest: () -> Unit,
    onUnblock: (String) -> Unit,
) {
    val type = LocalRoyTypeScale.current
    val spacing = LocalRoySpacing.current

    HorizontalDivider(color = RoyColors.border.copy(alpha = 0.4f))

    Column(
        modifier = Modifier.fillMaxWidth().padding(spacing.elementGapSm),
        verticalArrangement = Arrangement.spacedBy(spacing.elementGapSm),
    ) {
        when (face) {
            ThreadFace.WRITE ->
                Row(
                    horizontalArrangement = Arrangement.spacedBy(spacing.elementGapSm),
                    verticalAlignment = Alignment.Bottom,
                ) {
                    OutlinedTextField(
                        value = draft,
                        onValueChange = onDraft,
                        modifier = Modifier.weight(1f).heightIn(min = 44.dp, max = 128.dp),
                        placeholder = {
                            Text(text = ChatThreadCopy.PLACEHOLDER, style = type.small)
                        },
                        label = { Text(text = ChatThreadCopy.MESSAGE_LABEL, style = type.xs) },
                        singleLine = false,
                        maxLines = 4,
                    )
                    IconButton(
                        onClick = onSend,
                        enabled = !sending && draft.trim().isNotEmpty(),
                        modifier =
                            Modifier.size(44.dp)
                                .background(RoyColors.primary, CircleShape),
                    ) {
                        Icon(
                            imageVector = LucideVectors.Send,
                            contentDescription = ChatThreadCopy.SEND,
                            tint = RoyColors.primaryForeground,
                            modifier = Modifier.size(16.dp),
                        )
                    }
                }
            ThreadFace.ANSWER -> {
                Text(
                    text =
                        if (thread.kind == ChatThreadResponseThreadKind.GROUP) {
                            ChatThreadCopy.INVITE_GROUP.replace("{title}", thread.title)
                        } else {
                            ChatThreadCopy.INVITE_DIRECT.replace("{title}", thread.title)
                        },
                    style = type.xs,
                    color = RoyColors.mutedForeground,
                    textAlign = TextAlign.Center,
                    modifier = Modifier.fillMaxWidth(),
                )
                Row(
                    horizontalArrangement = Arrangement.spacedBy(spacing.elementGapSm),
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    OutlinedButton(
                        onClick = { onRespond(true) },
                        modifier = Modifier.weight(1f),
                    ) {
                        Text(
                            text = ChatsListCopy.ACCEPT,
                            style = type.small.copy(fontWeight = FontWeight.Bold),
                        )
                    }
                    OutlinedButton(
                        onClick = { onRespond(false) },
                        modifier = Modifier.weight(1f),
                    ) {
                        Text(text = ChatsListCopy.DECLINE, style = type.small)
                    }
                }
            }
            ThreadFace.WAITING -> {
                Text(
                    text = ChatThreadCopy.WAITING_COMPOSER.replace("{title}", thread.title),
                    style = type.xs,
                    color = RoyColors.mutedForeground,
                    textAlign = TextAlign.Center,
                    modifier = Modifier.fillMaxWidth(),
                )
                OutlinedButton(onClick = onWithdraw) {
                    Text(text = ChatThreadCopy.WITHDRAW, style = type.small)
                }
            }
            ThreadFace.BLOCKED -> {
                Text(
                    text = ChatThreadCopy.BLOCKED_COMPOSER,
                    style = type.xs,
                    color = RoyColors.mutedForeground,
                    textAlign = TextAlign.Center,
                    modifier = Modifier.fillMaxWidth(),
                )
                OutlinedButton(onClick = { counterpart?.id?.let(onUnblock) }) {
                    Text(text = ChatThreadCopy.UNBLOCK, style = type.small)
                }
            }
            ThreadFace.CLOSED ->
                if (
                    thread.kind == ChatThreadResponseThreadKind.DIRECT &&
                        counterpart != null
                ) {
                    Text(
                        text =
                            if (thread.status == ChatThreadResponseThreadStatus.DECLINED) {
                                ChatThreadCopy.CLOSED_DECLINED
                            } else {
                                ChatThreadCopy.CLOSED_ARCHIVED
                            },
                        style = type.xs,
                        color = RoyColors.mutedForeground,
                        textAlign = TextAlign.Center,
                        modifier = Modifier.fillMaxWidth(),
                    )
                    OutlinedButton(onClick = onRequest) {
                        Text(
                            text = ChatThreadCopy.NEW_REQUEST,
                            style = type.small.copy(fontWeight = FontWeight.Bold),
                        )
                    }
                } else {
                    Statement(
                        text =
                            if (thread.status == ChatThreadResponseThreadStatus.DECLINED) {
                                ChatThreadCopy.DECLINED_COMPOSER
                            } else {
                                ChatThreadCopy.NOT_MEMBER
                            }
                    )
                }
            ThreadFace.INACTIVE ->
                Statement(
                    text =
                        if (thread.status == ChatThreadResponseThreadStatus.DECLINED) {
                            ChatThreadCopy.DECLINED_COMPOSER
                        } else {
                            ChatThreadCopy.NOT_MEMBER
                        }
                )
        }
    }
}

@Composable
private fun Statement(text: String) {
    Text(
        text = text,
        style = LocalRoyTypeScale.current.xs.copy(fontWeight = FontWeight.Medium),
        color = RoyColors.mutedForeground,
        textAlign = TextAlign.Center,
        modifier = Modifier.fillMaxWidth(),
    )
}

/** A day's first line is introduced once, the way the site's separators do. */
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

/** The list's face for a thread this member may not see. */
@Composable
private fun MissingThread() {
    val type = LocalRoyTypeScale.current
    val spacing = LocalRoySpacing.current

    Column(
        modifier = Modifier.fillMaxSize().padding(spacing.containerPadding),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Text(
            text = ChatThreadCopy.NOT_FOUND,
            style = type.small.copy(fontWeight = FontWeight.Bold),
            color = RoyColors.foreground,
            textAlign = TextAlign.Center,
        )
    }
}

/** Nothing to show: an unreachable server, or one that refused the read. */
@Composable
private fun UnavailableThread(offline: Boolean, onRetry: () -> Unit) {
    Column(
        modifier = Modifier.fillMaxSize().padding(LocalRoySpacing.current.containerPadding),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        if (offline) {
            NeedsConnection(
                message = ChatThreadCopy.LOAD_FAILED,
                state = NeedsConnectionState.Block,
                onRetry = onRetry,
            )
        } else {
            ReadFailureNotice(
                message = ChatThreadCopy.LOAD_FAILED,
                state = ReadFailureState.Failed,
                onRetry = onRetry,
            )
        }
    }
}

/** The loading face: bubbles that are not there yet, and no sentence to say. */
@Composable
private fun ThreadSkeleton() {
    val spacing = LocalRoySpacing.current

    Column(
        modifier = Modifier.fillMaxSize().padding(spacing.containerPadding),
        verticalArrangement = Arrangement.spacedBy(spacing.elementGapSm),
    ) {
        repeat(3) { index ->
            Box(
                modifier =
                    Modifier.fillMaxWidth(if (index % 2 == 0) 0.7f else 0.55f)
                        .heightIn(min = 40.dp)
                        .background(Recipes.Skeleton.fill, Recipes.Skeleton.radius),
            )
        }
    }
}

/** A member's face: the picture the directory gave, or the first letter of the name. */
@Composable
private fun Avatar(name: String, url: String?) {
    if (!url.isNullOrBlank()) {
        AsyncImage(
            model = url,
            contentDescription = name,
            modifier = Modifier.size(36.dp).clip(CircleShape),
        )
        return
    }

    Box(
        modifier =
            Modifier.size(36.dp)
                .clip(CircleShape)
                .background(RoyColors.primary.copy(alpha = 0.15f)),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text = name.trim().take(1),
            style = LocalRoyTypeScale.current.small.copy(fontWeight = FontWeight.Bold),
            color = RoyColors.primary,
        )
    }
}

/** The site's window on an edit, mirrored: the RLS policy is the real gate. */
private fun withinEditWindow(createdAtIso: String): Boolean {
    val created = runCatching { Instant.parse(createdAtIso) }.getOrNull() ?: return false
    return Duration.between(created, Instant.now()) <= EDIT_WINDOW
}

/** The contract's ceiling on a group's members (`CHAT_GROUP_MEMBERS_MAX`). */
private const val MAX_GROUP_MEMBERS = 32

/** The confirmation one write asks for, and the write itself. */
@Composable
private fun ChatDialogCard(
    dialog: ChatDialog,
    conversationId: String,
    repository: ChatsRepository,
    busy: Boolean,
    thread: ChatThreadResponseThread?,
    onBusy: (Boolean) -> Unit,
    onDone: () -> Unit,
    onFailure: (String) -> Unit,
    onDismiss: () -> Unit,
) {
    val scope = rememberCoroutineScope()
    val type = LocalRoyTypeScale.current
    val title =
        when (dialog) {
            is ChatDialog.Respond ->
                if (dialog.accept) ChatsListCopy.CONFIRM_ACCEPT_TITLE
                else ChatsListCopy.CONFIRM_DECLINE_TITLE
            ChatDialog.Withdraw -> ChatThreadCopy.WITHDRAW_TITLE
            ChatDialog.Block ->
                ChatThreadCopy.BLOCK_TITLE.replace("{title}", thread?.title.orEmpty())
            ChatDialog.Leave -> ChatThreadCopy.LEAVE_TITLE
            is ChatDialog.Delete -> ChatThreadCopy.DELETE_MESSAGE_TITLE
        }
    val message =
        when (dialog) {
            is ChatDialog.Respond ->
                answerSentence(
                    thread = thread,
                    accept = dialog.accept,
                )
            ChatDialog.Withdraw -> ChatThreadCopy.WITHDRAW_MESSAGE
            ChatDialog.Block -> ChatThreadCopy.BLOCK_MESSAGE
            ChatDialog.Leave -> ChatThreadCopy.LEAVE_MESSAGE
            is ChatDialog.Delete -> ChatThreadCopy.DELETE_MESSAGE_MESSAGE
        }
    val label =
        when (dialog) {
            is ChatDialog.Respond -> if (dialog.accept) ChatsListCopy.ACCEPT else ChatsListCopy.DECLINE
            ChatDialog.Withdraw -> ChatThreadCopy.WITHDRAW
            ChatDialog.Block -> ChatThreadCopy.BLOCK
            ChatDialog.Leave -> ChatThreadCopy.LEAVE_LABEL
            is ChatDialog.Delete -> ChatThreadCopy.DELETE
        }

    fun run() {
        scope.launch {
            onBusy(true)
            val result: ApiResult<Unit> =
                when (dialog) {
                    is ChatDialog.Respond -> repository.respond(conversationId, dialog.accept)
                    ChatDialog.Withdraw -> repository.withdraw(conversationId)
                    ChatDialog.Block -> {
                        val peerId = thread?.counterpart?.id
                        if (peerId == null) ApiResult.Success(Unit) else repository.block(peerId)
                    }
                    ChatDialog.Leave -> repository.leave(conversationId)
                    is ChatDialog.Delete -> repository.delete(dialog.messageId)
                }
            onBusy(false)
            when (result) {
                is ApiResult.Success -> onDone()
                is ApiResult.Failure ->
                    onFailure(ChatFailure.sentenceOf(result.error) ?: ChatThreadCopy.REQUEST_FAILED)
            }
        }
    }

    AlertDialog(
        onDismissRequest = { if (!busy) onDismiss() },
        title = { Text(text = title, style = type.h3.copy(fontWeight = FontWeight.Bold)) },
        text = { Text(text = message, style = type.small) },
        confirmButton = {
            TextButton(onClick = ::run, enabled = !busy) {
                Text(text = label, style = type.small.copy(fontWeight = FontWeight.Bold))
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss, enabled = !busy) {
                Text(text = ChatThreadCopy.CANCEL, style = type.small)
            }
        },
        containerColor = RoyColors.card,
    )
}

/** The accept/decline sentence: a direct request and an invitation differ. */
private fun answerSentence(thread: ChatThreadResponseThread?, accept: Boolean): String {
    val group = thread?.kind == ChatThreadResponseThreadKind.GROUP
    val title = thread?.title.orEmpty()
    return when {
        accept && group -> ChatsListCopy.ACCEPT_GROUP_MESSAGE.replace("{title}", title)
        accept -> ChatsListCopy.ACCEPT_DIRECT_MESSAGE.replace("{title}", title)
        group -> ChatsListCopy.DECLINE_GROUP_MESSAGE
        else -> ChatsListCopy.DECLINE_DIRECT_MESSAGE
    }
}
