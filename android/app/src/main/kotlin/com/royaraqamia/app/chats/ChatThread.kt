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
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
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
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.awaitCancellation
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import java.time.Duration
import java.time.Instant
import java.util.Locale

/**
 * What the outbox is doing with one of the member's lines (#1033).
 *
 * `Sent` is every line the server already holds, and every line the app has not
 * queued: the queue itself is the web client's until the app's store lands, so
 * this rendering path is here to keep the two clients worded the same.
 */
private enum class MessagePending { Sent, Queued, Failed }

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
    /**
     * The thread's live hint (ADR-0060, ADR-0141). Absent in a test or a tree
     * whose Realtime client is not wired, and then the screen simply has no
     * live line — it still reads once on open and answers every write.
     */
    hints: ChatHintSource? = null,
    /** The member's presence stream; absent in a test or an unwired tree. */
    presence: ChatPresenceSource? = null,
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
    /** The files the composer has staged, validated before they were added (#933). */
    var attached by remember { mutableStateOf<List<ChatComposeFile>>(emptyList()) }
    var menuOpen by remember { mutableStateOf(false) }
    var dialog by remember { mutableStateOf<ChatDialog?>(null) }
    var busy by remember { mutableStateOf(false) }
    var editing by remember { mutableStateOf<String?>(null) }
    var editingText by remember { mutableStateOf("") }
    /** The newest line already stamped read: a re-read must not write again for it. */
    var markedLine by remember { mutableStateOf<String?>(null) }
    /** The lines the queue still owes, by their client id (#1127). */
    var pendingLines by remember { mutableStateOf<Map<String, ChatPending>>(emptyMap()) }

    /** What the peer is doing, as the wire word, or null when they are idle. */
    var peerPresence by remember { mutableStateOf<String?>(null) }
    var presenceStamp by remember { mutableLongStateOf(0L) }
    var lastTypingSent by remember { mutableLongStateOf(0L) }

    /** Who this thread's live line is about, and who it is drawn for. */
    val presenceThread = (read as? ChatThreadUiState.Live)?.thread
    val selfId = presenceThread?.me?.userId
    val peerId = presenceThread?.counterpart?.id

    /** One read of the thread and its lines, and the read watermark it stamps. */
    suspend fun load() {
        // The device's copy first (#1127): a reload with no radio keeps the
        // thread it was reading, and the network is the revalidation.
        if (read == null) {
            repository.cachedThread(conversationId)?.let { read = ChatThreadUiState.Live(it) }
        }
        if (messages.isEmpty()) {
            messages = repository.cachedMessages(conversationId)
        }
        pendingLines = repository.pending(conversationId)

        when (val result = repository.thread(conversationId)) {
            is ApiResult.Success -> {
                if (result.value.kind == ChatThreadResponseThreadKind.AGENT) {
                    // Handed over: the document streams its own answer, so the
                    // app does not draw a second, worse conversation.
                    onOpenAssistantThread(conversationId)
                    return
                }
                read = ChatThreadUiState.Live(result.value)
                when (val page = repository.messages(conversationId)) {
                    is ApiResult.Success -> {
                        messages = page.value.messages
                        pendingLines = repository.pending(conversationId)
                        // Seen is stamped once per *new* line, the way the site's hook
                        // does: the badge is the reader's watermark (#816), and a read
                        // that wrote again for the same line would spend a write for
                        // nothing.
                        val newest = page.value.messages.lastOrNull()?.id
                        if (newest != null && newest != markedLine) {
                            markedLine = newest
                            repository.markRead(conversationId)
                        }
                    }
                    is ApiResult.Failure ->
                        failure = ChatFailure.sentenceOf(page.error) ?: ChatThreadCopy.LOAD_FAILED
                }
            }
            is ApiResult.Failure -> {
                // Only the first read decides the face: a later read that fails
                // while a thread is drawn must not replace it with an error.
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
    }

    /**
     * A burst of hints is one pull, the same 400 ms window the site's hook uses.
     * The payload never reaches the screen: a hint says "something changed" and
     * the read that follows merges by id, so a reconnect cannot draw a message
     * that is already there (ADR-0060, ADR-0141).
     */
    val hint = remember(conversationId) { Channel<Unit>(Channel.CONFLATED) }

    // One read on open (and again after every write), never on a clock.
    LaunchedEffect(repository, conversationId, attempts) {
        load()
    }

    // The assistant's thread is the document, so it has no live line here: the
    // previous poll had to stop before handing over, and a hint would open the
    // document again for a thread this screen must not draw (#819).
    val liveThread = (read as? ChatThreadUiState.Live)?.thread
    val hintable = liveThread != null && liveThread.kind != ChatThreadResponseThreadKind.AGENT

    // The site's behaviour, made the app's: pull on a hint, never on a payload.
    LaunchedEffect(hints, conversationId, hintable) {
        val source = hints ?: return@LaunchedEffect
        if (!hintable) return@LaunchedEffect
        val subscription = source.subscribe(conversationId) { hint.trySend(Unit) }
        try {
            while (true) {
                hint.receive()
                delay(HINT_DEBOUNCE_MS)
                while (hint.tryReceive().isSuccess) {
                    // Fold the burst into the one pull below.
                }
                load()
            }
        } finally {
            subscription.close()
        }
    }

    /**
     * The write half (ADR-0167): the conversation's own topic, joined while this
     * thread is open. A guest, an assistant thread or a group has no peer, so
     * there is nothing to join.
     */
    val publisher =
        remember(presence, selfId, peerId, conversationId) {
            if (presence != null && selfId != null && peerId != null) {
                presence.publisher(conversationId, selfId)
            } else {
                null
            }
        }
    DisposableEffect(publisher) {
        onDispose { publisher?.close() }
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

    /** A pick joins the staged list, or says which allowance refused it (#933). */
    fun addFiles(picked: List<ChatComposeFile>) {
        if (picked.isEmpty()) return
        val quota = (read as? ChatThreadUiState.Live)?.thread?.attachmentQuota ?: return
        when (val staged = ChatAttachments.stage(attached, picked, quota)) {
            is ChatAttachmentStage.Staged -> {
                attached = staged.files
                failure = null
            }
            is ChatAttachmentStage.Refused -> failure = staged.sentence
        }
    }

    fun send() {
        val text = draft.trim()
        if ((text.isEmpty() && attached.isEmpty()) || sending) return
        scope.launch {
            sending = true
            val senderId = (read as? ChatThreadUiState.Live)?.thread?.me?.userId
            val result =
                if (attached.isEmpty()) {
                    repository.send(conversationId, text, senderId = senderId)
                } else {
                    repository.sendWithAttachments(
                        conversationId,
                        text,
                        attached,
                        senderId = senderId,
                    )
                }
            when (result) {
                is ApiResult.Success -> {
                    draft = ""
                    attached = emptyList()
                    failure = null
                    lastTypingSent = 0
                    publisher?.announce(conversationId, ChatPresence.STOP)
                    load()
                }
                is ApiResult.Failure ->
                    failure =
                        ChatFailure.sentenceOf(result.error) ?: ChatThreadCopy.REQUEST_FAILED
            }
            sending = false
        }
    }

    /**
     * A finished clip is its own message, sent the moment it lands: the same
     * order the site's composer uses, so a voice note is never staged beside a
     * draft the member has not finished (#933).
     */
    val recorder =
        rememberVoiceNoteRecorder { clip ->
            scope.launch {
                sending = true
                val senderId = (read as? ChatThreadUiState.Live)?.thread?.me?.userId
                when (
                    val result =
                        repository.sendWithAttachments(
                            conversationId,
                            "",
                            listOf(clip),
                            senderId = senderId,
                        )
                ) {
                    is ApiResult.Success -> {
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

    /** A keystroke, throttled at the site's window; a recording outranks it. */
    fun announceTyping() {
        if (recorder.isRecording) return
        val now = System.currentTimeMillis()
        if (now - lastTypingSent < ChatPresence.TYPING_THROTTLE_MS) return
        lastTypingSent = now
        publisher?.announce(conversationId, ChatPresenceState.Typing.wire)
    }

    // The conversation's own topic while this thread is open: one subscription,
    // and only the counterpart's events for this conversation are believed.
    LaunchedEffect(presence, selfId, peerId, conversationId) {
        val source = presence ?: return@LaunchedEffect
        if (selfId == null || peerId == null) return@LaunchedEffect

        val subscription =
            source.listen(setOf(conversationId), selfId) { event ->
                if (event.conversationId != conversationId || event.userId != peerId) {
                    return@listen
                }
                peerPresence = event.state.takeIf { it != ChatPresence.STOP }
                presenceStamp = System.currentTimeMillis()
            }
        try {
            awaitCancellation()
        } finally {
            subscription.close()
        }
    }

    // The reader forgets each state on its own window, so a dropped stop cannot
    // pin the line on screen.
    LaunchedEffect(peerPresence, presenceStamp) {
        val state = peerPresence ?: return@LaunchedEffect
        val observed = presenceStamp
        delay(
            if (state == ChatPresenceState.Recording.wire) {
                ChatPresence.RECORDING_TIMEOUT_MS
            } else {
                ChatPresence.TYPING_TIMEOUT_MS
            }
        )
        if (presenceStamp == observed) peerPresence = null
    }

    // A recording is a long state: announce it, then keep it alive every window
    // until the microphone closes, and say stop when it does.
    LaunchedEffect(recorder.isRecording) {
        if (!recorder.isRecording) {
            publisher?.announce(conversationId, ChatPresence.STOP)
            return@LaunchedEffect
        }
        while (true) {
            publisher?.announce(conversationId, ChatPresenceState.Recording.wire)
            delay(ChatPresence.RECORDING_HEARTBEAT_MS)
        }
    }

    // The five-minute ceiling ends the capture and sends what was said.
    LaunchedEffect(recorder.isRecording, recorder.elapsedMs) {
        if (recorder.isRecording && recorder.elapsedMs >= VOICE_NOTE_MAX_MS) {
            recorder.finish()
        }
    }

    val presenceText =
        when (peerPresence) {
            ChatPresenceState.Typing.wire -> ChatThreadCopy.TYPING_NOW
            ChatPresenceState.Recording.wire -> ChatThreadCopy.RECORDING_NOW
            else -> null
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
                    attached = attached,
                    sending = sending,
                    failure = failure,
                    menuOpen = menuOpen,
                    editing = editing,
                    editingText = editingText,
                    pendingLines = pendingLines,
                    presence = presenceText,
                    recorder = recorder,
                    onRetry = { message ->
                        message.clientId?.let { clientId ->
                            scope.launch {
                                repository.retryMessage(conversationId, clientId)
                                load()
                            }
                        }
                    },
                    onDraft = {
                        draft = it
                        if (it.isNotBlank()) announceTyping()
                    },
                    onSend = ::send,
                    onPick = ::addFiles,
                    onRemoveAttachment = { index ->
                        attached = attached.filterIndexed { at, _ -> at != index }
                    },
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

/** The site's burst window (`HINT_DEBOUNCE_MS`): many hints, one pull. */
private const val HINT_DEBOUNCE_MS = 400L

/** The site's edit window (`CHAT_EDIT_WINDOW_MS`), mirrored by the RLS policy. */
private val EDIT_WINDOW: Duration = Duration.ofMinutes(15)

private sealed interface ChatDialog {
    data class Respond(val accept: Boolean) : ChatDialog

    data object Withdraw : ChatDialog

    data object Block : ChatDialog

    data class Delete(val messageId: String) : ChatDialog
}

/** The conversation, once the server has answered it. */
@Composable
private fun ThreadBody(
    thread: ChatThreadResponseThread,
    messages: List<ChatMessagePageResponseMessagesItem>,
    draft: String,
    attached: List<ChatComposeFile>,
    sending: Boolean,
    failure: String?,
    menuOpen: Boolean,
    editing: String?,
    editingText: String,
    pendingLines: Map<String, ChatPending>,
    /** The live line under the name, or null when the peer is idle. */
    presence: String?,
    recorder: VoiceNoteRecorderState,
    onRetry: (ChatMessagePageResponseMessagesItem) -> Unit,
    onDraft: (String) -> Unit,
    onSend: () -> Unit,
    onPick: (List<ChatComposeFile>) -> Unit,
    onRemoveAttachment: (Int) -> Unit,
    onMenu: (Boolean) -> Unit,
    onDialog: (ChatDialog) -> Unit,
    onEditStart: (ChatMessagePageResponseMessagesItem) -> Unit,
    onEditText: (String) -> Unit,
    onEditCancel: () -> Unit,
    onEditSave: (ChatMessagePageResponseMessagesItem) -> Unit,
    onDownload: (String) -> Unit,
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
            presence = presence,
            menuOpen = menuOpen,
            onMenu = onMenu,
            onBlock = { onDialog(ChatDialog.Block) },
        )

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
                        pending = when (pendingLines[message.clientId]) {
                            ChatPending.Queued -> MessagePending.Queued
                            ChatPending.Failed -> MessagePending.Failed
                            else -> MessagePending.Sent
                        },
                        onRetry = { onRetry(message) },
                    )
                }
            }
        }

        Footer(
            thread = thread,
            face = face,
            counterpart = counterpart,
            draft = draft,
            attached = attached,
            sending = sending,
            recorder = recorder,
            onDraft = onDraft,
            onSend = onSend,
            onPick = onPick,
            onRemoveAttachment = onRemoveAttachment,
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
    presence: String?,
    menuOpen: Boolean,
    onMenu: (Boolean) -> Unit,
    onBlock: () -> Unit,
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
        // The site's header carries its own back control, and the shell's floating
        // one is skipped on an open conversation, so the two clients hold one each.
        Icon(
            imageVector = LucideVectors.ArrowRight,
            contentDescription = null,
            tint = RoyColors.mutedForeground,
            modifier = Modifier.size(Recipes.Glyph.md),
        )

        Avatar(
            name = thread.counterpart?.name ?: thread.counterpart?.username ?: thread.title,
            url = thread.counterpart?.avatarUrl,
        )

        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = thread.title,
                style = type.small.copy(fontWeight = FontWeight.Bold),
                color = RoyColors.foreground,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            /*
              One slot, two sentences: the live line takes the handle's place and
              gives it back when the peer stops (ADR-0165). The header's height is
              the avatar's either way, so nothing jumps.
            */
            if (presence != null) {
                ChatPresenceLine(
                    label = presence,
                    style = type.xs,
                    color = RoyColors.primary,
                )
            } else {
                Text(
                    text = counterpart?.let { "@$it" } ?: "",
                    style = type.xs,
                    color = RoyColors.mutedForeground.copy(alpha = 0.7f),
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
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
            }
        }
    }

    HorizontalDivider(color = RoyColors.border.copy(alpha = 0.4f))
}

/** The empty thread: who this is, and what can happen next. */
@Composable
private fun Intro(thread: ChatThreadResponseThread, face: ThreadFace) {
    val type = LocalRoyTypeScale.current
    val spacing = LocalRoySpacing.current

    val note =
        when (face) {
            ThreadFace.ANSWER -> ChatThreadCopy.INVITE_DIRECT.replace("{title}", thread.title)
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
    pending: MessagePending = MessagePending.Sent,
    onRetry: () -> Unit = {},
) {
    val type = LocalRoyTypeScale.current
    val spacing = LocalRoySpacing.current
    val deleted = message.deletedAt != null
    val settled = pending == MessagePending.Sent
    val editable =
        mine && !deleted && settled && withinEditWindow(message.createdAt)
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

/** The bottom of the screen: six faces, and each says what can happen next. */
@Composable
private fun Footer(
    thread: ChatThreadResponseThread,
    face: ThreadFace,
    counterpart: com.royaraqamia.app.contracts.generated.ChatThreadResponseThreadParticipantsItemPeer?,
    draft: String,
    attached: List<ChatComposeFile>,
    sending: Boolean,
    recorder: VoiceNoteRecorderState,
    onDraft: (String) -> Unit,
    onSend: () -> Unit,
    onPick: (List<ChatComposeFile>) -> Unit,
    onRemoveAttachment: (Int) -> Unit,
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
            ThreadFace.WRITE -> {
                if (recorder.isRecording || recorder.isPreparing) {
                    ChatRecordingBar(recorder)
                } else {
                    ChatComposerAttach(
                        files = attached,
                        enabled = !sending,
                        onPicked = onPick,
                        onRemove = onRemoveAttachment,
                    )
                    val hasContent = draft.trim().isNotEmpty() || attached.isNotEmpty()
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
                            maxLines = 5,
                        )
                        IconButton(
                            onClick = { if (hasContent) onSend() else recorder.record() },
                            enabled = !sending && !recorder.isPreparing,
                            modifier =
                                Modifier.size(44.dp)
                                    .background(RoyColors.primary, CircleShape),
                        ) {
                            Icon(
                                imageVector =
                                    if (hasContent) LucideVectors.Send else LucideVectors.Mic,
                                contentDescription =
                                    if (hasContent) ChatThreadCopy.SEND
                                    else ChatThreadCopy.RECORD_LABEL,
                                tint = RoyColors.primaryForeground,
                                modifier = Modifier.size(16.dp),
                            )
                        }
                    }
                }
            }
            ThreadFace.ANSWER -> {
                Text(
                    text = ChatThreadCopy.INVITE_DIRECT.replace("{title}", thread.title),
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

/** The live capture: the timer, the meter, and the two ways out of it. */
@Composable
private fun ChatRecordingBar(recorder: VoiceNoteRecorderState) {
    val type = LocalRoyTypeScale.current
    val spacing = LocalRoySpacing.current

    Row(
        modifier =
            Modifier.fillMaxWidth()
                .background(RoyColors.destructive.copy(alpha = 0.1f), RoundedCornerShape(12.dp))
                .padding(horizontal = spacing.elementGapSm, vertical = 6.dp),
        horizontalArrangement = Arrangement.spacedBy(6.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(Modifier.size(8.dp).background(RoyColors.destructive, CircleShape))
        Text(
            text = voiceDuration(recorder.elapsedMs),
            style = type.xs,
            color = RoyColors.foreground,
            maxLines = 1,
        )
        Row(
            modifier = Modifier.weight(1f),
            horizontalArrangement = Arrangement.spacedBy(2.dp),
            verticalAlignment = Alignment.Bottom,
        ) {
            recorder.levels.takeLast(VOICE_LEVEL_BARS).forEach { level ->
                Box(
                    modifier =
                        Modifier.width(3.dp)
                            .height((4 + level * 16).dp)
                            .background(
                                RoyColors.destructive.copy(alpha = 0.7f),
                                RoundedCornerShape(2.dp),
                            )
                )
            }
        }
        IconButton(onClick = recorder::cancel, modifier = Modifier.size(24.dp)) {
            Icon(
                imageVector = LucideVectors.X,
                contentDescription = ChatThreadCopy.CANCEL_RECORDING,
                tint = RoyColors.mutedForeground,
                modifier = Modifier.size(14.dp),
            )
        }
        IconButton(onClick = recorder::finish, modifier = Modifier.size(32.dp)) {
            Icon(
                imageVector = LucideVectors.Square,
                contentDescription = ChatThreadCopy.STOP_RECORDING,
                tint = RoyColors.destructive,
                modifier = Modifier.size(14.dp),
            )
        }
    }
}

/** `m:ss`, ASCII digits whatever the phone's locale says. */
private fun voiceDuration(ms: Long): String {
    val total = (ms / 1_000).coerceAtLeast(0)
    return String.format(Locale.US, "%d:%02d", total / 60, total % 60)
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
            is ChatDialog.Delete -> ChatThreadCopy.DELETE_MESSAGE_MESSAGE
        }
    val label =
        when (dialog) {
            is ChatDialog.Respond -> if (dialog.accept) ChatsListCopy.ACCEPT else ChatsListCopy.DECLINE
            ChatDialog.Withdraw -> ChatThreadCopy.WITHDRAW
            ChatDialog.Block -> ChatThreadCopy.BLOCK
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

/** The accept/decline sentence for the request. */
private fun answerSentence(thread: ChatThreadResponseThread?, accept: Boolean): String {
    val title = thread?.title.orEmpty()
    return if (accept) {
        ChatsListCopy.ACCEPT_DIRECT_MESSAGE.replace("{title}", title)
    } else {
        ChatsListCopy.DECLINE_DIRECT_MESSAGE
    }
}
