package com.royaraqamia.app.assistant

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListState
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.royaraqamia.app.chats.AssistantMark
import com.royaraqamia.app.chats.ChatAttachmentStage
import com.royaraqamia.app.chats.ChatAttachments
import com.royaraqamia.app.chats.ChatComposeFile
import com.royaraqamia.app.chats.ChatComposerAttach
import com.royaraqamia.app.chats.ChatFailure
import com.royaraqamia.app.chats.ChatsRepository
import com.royaraqamia.app.contracts.ApiResult
import com.royaraqamia.app.contracts.generated.ChatAssistantStateResponseAllowance
import com.royaraqamia.app.contracts.generated.ChatMessagePageResponseMessagesItem
import com.royaraqamia.app.contracts.generated.ChatMessagePageResponseMessagesItemSenderKind
import com.royaraqamia.app.contracts.generated.ChatThreadResponseThreadAttachmentQuota
import com.royaraqamia.app.contracts.generated.ChatThreadsResponseThreadsItemKind
import com.royaraqamia.app.theme.LocalRoySpacing
import com.royaraqamia.app.theme.LocalRoyTypeScale
import com.royaraqamia.app.theme.RoyColors
import com.royaraqamia.app.theme.RoyTypeScale
import com.royaraqamia.app.ui.vectors.LucideVectors
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.launch

/** The handle a UI test finds the sheet by. */
const val ASSISTANT_SHEET_TAG = "assistant-sheet"

/**
 * نور's floating conversation, on the app's own frame (ADR-0143).
 *
 * It is the sheet the corner's door opens: the member's thread, streamed a frame
 * at a time, with the same states the site's panel draws — guest, locked, no
 * provider, loading, failed, ready, asking — and the same words from
 * `AssistantPanelCopy`. The thread is created on open (`startAssistant` is
 * idempotent), read through the chats repository, and written through the
 * assistant's streamed turn.
 *
 * **What this sheet does not do yet:** a proposal is not confirmed here. The
 * card's contract is not generated for Kotlin, and the native chats port is still
 * behind the visual gate, so the sheet keeps its text and the header's "open the
 * full conversation" link carries the member to the page where the proposal is
 * actionable. The remaining work is tracked in the issues the ADR names.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AssistantSheet(
    repository: ChatsRepository,
    signedIn: Boolean,
    /** What the shell last painted; null on the first open of this process. */
    snapshot: AssistantSnapshot?,
    /** Records the page the shell keeps for the next open (ADR-0150). */
    onSnapshot: (AssistantSnapshot) -> Unit,
    onDismiss: () -> Unit,
    onSignIn: () -> Unit,
    onUpgrade: () -> Unit,
    onOpenAttachment: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    val scope = rememberCoroutineScope()
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    val spacing = LocalRoySpacing.current
    val type = LocalRoyTypeScale.current
    val listState = rememberLazyListState()
    val report = rememberUpdatedState(onSnapshot)

    var state by remember {
        mutableStateOf(
            when {
                !signedIn -> AssistantUiState.Guest
                // A reopen paints the face the last one ended on; the live read
                // below corrects it if the plan or the deployment changed.
                snapshot != null -> snapshot.face()
                else -> AssistantUiState.Loading
            }
        )
    }
    var threadId by remember { mutableStateOf(snapshot?.threadId) }
    var quota by remember { mutableStateOf(snapshot?.quota) }
    var messages by remember { mutableStateOf(snapshot?.messages ?: emptyList()) }
    var available by remember { mutableStateOf(snapshot?.available ?: true) }
    var allowance by remember { mutableStateOf(snapshot?.allowance) }
    var streaming by remember { mutableStateOf("") }
    var tools by remember { mutableStateOf<List<String>>(emptyList()) }
    var notice by remember { mutableStateOf<String?>(null) }
    var draft by remember { mutableStateOf("") }
    var staged by remember { mutableStateOf<List<ChatComposeFile>>(emptyList()) }
    var attempt by remember { mutableIntStateOf(0) }

    val events = remember { MutableSharedFlow<AssistantEvent>(extraBufferCapacity = 512) }

    // The stream's frames arrive on the IO thread; this collector is the main
    // thread's one writer, which is what keeps the sheet's state single-threaded.
    LaunchedEffect(events) {
        events.collect { event ->
            when (event) {
                is AssistantEvent.Delta ->
                    if (state == AssistantUiState.Asking) streaming += event.text
                is AssistantEvent.Tool -> tools = tools + event.label
                is AssistantEvent.Error -> notice = event.message
                is AssistantEvent.Proposal -> notice = event.label.ifBlank { null }
                AssistantEvent.Done -> Unit
            }
        }
    }

    suspend fun refreshAssistant() {
        when (val info = repository.assistant()) {
            is ApiResult.Success -> {
                // A deployment that names no key is the only "off" answer; a
                // missing field is a deployment that has one.
                available = info.value.available != false
                allowance = info.value.allowance
            }
            is ApiResult.Failure -> Unit
        }
    }

    suspend fun load(id: String): Boolean {
        var readFailed = false
        when (val header = repository.thread(id)) {
            is ApiResult.Success -> quota = header.value.attachmentQuota
            is ApiResult.Failure -> readFailed = true
        }
        when (val page = repository.messages(id)) {
            is ApiResult.Success -> {
                messages = page.value.messages
                repository.markRead(id)
            }
            is ApiResult.Failure -> readFailed = true
        }
        return readFailed
    }

    /** Hands the page just painted to the shell, for the next open. */
    fun publish() {
        report.value(
            AssistantSnapshot(
                threadId = threadId,
                quota = quota,
                messages = messages,
                available = available,
                allowance = allowance,
            )
        )
    }

    LaunchedEffect(signedIn, attempt) {
        if (!signedIn) {
            state = AssistantUiState.Guest
            return@LaunchedEffect
        }

        // A snapshot means this is a reopen: the conversation is already on
        // screen, so the read below must not blank it to a spinner.
        if (snapshot == null && threadId == null) state = AssistantUiState.Loading
        notice = null

        // A process that was killed still has the thread on the device; the
        // list's stored row is how its id is found without asking the server.
        if (snapshot == null && threadId == null) {
            val cached =
                repository.cachedThreads().firstOrNull {
                    it.kind == ChatThreadsResponseThreadsItemKind.AGENT
                }
            val header = cached?.let { repository.cachedThread(it.id) }
            if (cached != null && header != null) {
                threadId = cached.id
                quota = header.attachmentQuota
                val held = repository.cachedMessages(cached.id)
                if (held.isNotEmpty()) messages = held
                state = AssistantUiState.Ready
            }
        }

        val known = threadId
        if (known != null) {
            // Read through the cached thread directly: the open call is only
            // needed when no thread has ever been seen.
            val readFailed = load(known)
            refreshAssistant()
            state =
                when {
                    !available -> AssistantUiState.Unavailable
                    allowance?.member?.cap == 0.0 -> AssistantUiState.Locked
                    readFailed && messages.isEmpty() && snapshot == null -> AssistantUiState.Failed
                    else -> AssistantUiState.Ready
                }
            publish()
            return@LaunchedEffect
        }

        when (val started = repository.startAssistant()) {
            is ApiResult.Success -> {
                val id = started.value.conversationId
                if (id == null) {
                    state = AssistantUiState.Failed
                    return@LaunchedEffect
                }
                threadId = id
                val readFailed = load(id)
                refreshAssistant()
                state =
                    when {
                        readFailed && messages.isEmpty() -> AssistantUiState.Failed
                        !available -> AssistantUiState.Unavailable
                        allowance?.member?.cap == 0.0 -> AssistantUiState.Locked
                        else -> AssistantUiState.Ready
                    }
                publish()
            }
            is ApiResult.Failure -> state = AssistantUiState.Failed
        }
    }

    LaunchedEffect(messages.size, streaming) {
        // The last row is the streaming bubble while a turn is in flight, and
        // may be preceded by the tools line; the list itself knows the index.
        val target =
            if (state == AssistantUiState.Asking) {
                (listState.layoutInfo.totalItemsCount - 1).coerceAtLeast(0)
            } else {
                messages.lastIndex
            }
        if (target < 0) return@LaunchedEffect

        // Follow only while the reader is at the bottom: an earlier answer they
        // scrolled back to must not be pulled away by the next token. A direct
        // scroll, not an animation, because a token restarts the effect.
        val visible = listState.layoutInfo.visibleItemsInfo
        val atBottom =
            visible.isEmpty() ||
                visible.last().index >= listState.layoutInfo.totalItemsCount - 2
        if (atBottom) listState.scrollToItem(target)
    }

    fun stage(picked: List<ChatComposeFile>) {
        val allowances = quota ?: return
        when (val result = ChatAttachments.stage(staged, picked, allowances)) {
            is ChatAttachmentStage.Staged -> {
                staged = result.files
                notice = null
            }
            is ChatAttachmentStage.Refused -> notice = result.sentence
        }
    }

    fun send() {
        val id = threadId ?: return
        if (state == AssistantUiState.Asking) return
        val body = draft.trim()
        val files = staged
        if (body.isEmpty() && files.isEmpty()) return

        draft = ""
        staged = emptyList()
        streaming = ""
        tools = emptyList()
        notice = null
        state = AssistantUiState.Asking

        scope.launch {
            val result =
                repository.streamAssistant(id, body, files) { event -> events.tryEmit(event) }
            if (result is ApiResult.Failure) {
                notice = ChatFailure.sentenceOf(result.error) ?: AssistantPanelCopy.FAILED
            }
            load(id)
            refreshAssistant()
            state =
                when {
                    !available -> AssistantUiState.Unavailable
                    allowance?.member?.cap == 0.0 -> AssistantUiState.Locked
                    else -> AssistantUiState.Ready
                }
            streaming = ""
            publish()
        }
    }

    fun openAttachment(attachmentId: String) {
        val id = threadId ?: return
        scope.launch {
            when (val result = repository.attachmentUrl(id, attachmentId)) {
                is ApiResult.Success -> result.value.url?.let(onOpenAttachment)
                is ApiResult.Failure ->
                    notice = ChatFailure.sentenceOf(result.error) ?: AssistantPanelCopy.FAILED
            }
        }
    }

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = sheetState,
        containerColor = RoyColors.background,
        contentColor = RoyColors.foreground,
        modifier = modifier.testTag(ASSISTANT_SHEET_TAG),
    ) {
        Column(
            modifier =
                Modifier.fillMaxWidth()
                    .fillMaxHeight(0.92f)
                    .padding(horizontal = spacing.containerPadding),
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(spacing.elementGapSm),
            ) {
                AssistantMark(size = 36.dp)
                Column(Modifier.weight(1f)) {
                    Text(
                        text = AssistantPanelCopy.TITLE,
                        style = type.h6.copy(fontWeight = FontWeight.Bold),
                        color = RoyColors.foreground,
                    )
                }
            }

            Box(Modifier.weight(1f).fillMaxWidth()) {
                when (state) {
                    AssistantUiState.Guest ->
                        AssistantStatePanel(
                            title = AssistantPanelCopy.GUEST_TITLE,
                            body = AssistantPanelCopy.GUEST_BODY,
                            action = AssistantPanelCopy.SIGN_IN,
                            onAction = onSignIn,
                            orb = true,
                        )
                    AssistantUiState.Locked ->
                        AssistantStatePanel(
                            title = AssistantPanelCopy.LOCKED,
                            body = null,
                            action = AssistantPanelCopy.UPGRADE,
                            onAction = onUpgrade,
                            orb = true,
                        )
                    AssistantUiState.Unavailable ->
                        AssistantStatePanel(
                            title = AssistantPanelCopy.UNAVAILABLE,
                            body = null,
                            action = null,
                            onAction = {},
                            orb = true,
                        )
                    AssistantUiState.Loading ->
                        AssistantStatePanel(
                            title = AssistantPanelCopy.LOADING,
                            body = null,
                            action = null,
                            onAction = {},
                            orb = false,
                            loading = true,
                        )
                    AssistantUiState.Failed ->
                        AssistantStatePanel(
                            title = AssistantPanelCopy.FAILED,
                            body = null,
                            action = AssistantPanelCopy.RETRY,
                            onAction = { attempt += 1 },
                            orb = false,
                            failed = true,
                        )
                    AssistantUiState.Ready, AssistantUiState.Asking ->
                        AssistantConversation(
                            messages = messages,
                            streaming = streaming,
                            tools = tools,
                            asking = state == AssistantUiState.Asking,
                            listState = listState,
                            type = type,
                            onOpenAttachment = ::openAttachment,
                            onPick = { draft = it },
                        )
                }
            }

            notice?.let { sentence ->
                Text(
                    text = sentence,
                    style = type.xs,
                    color = RoyColors.mutedForeground,
                    modifier = Modifier.padding(vertical = spacing.elementGapSm / 2),
                )
            }

            if (state == AssistantUiState.Ready || state == AssistantUiState.Asking) {
                Column(
                    modifier =
                        Modifier.fillMaxWidth()
                            .navigationBarsPadding()
                            .padding(bottom = spacing.elementGapSm),
                    verticalArrangement = Arrangement.spacedBy(spacing.elementGapSm / 2),
                ) {
                    if (quota != null) {
                        ChatComposerAttach(
                            files = staged,
                            enabled = state != AssistantUiState.Asking,
                            onPicked = ::stage,
                            onRemove = { index ->
                                staged = staged.filterIndexed { at, _ -> at != index }
                            },
                        )
                    }
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        verticalAlignment = Alignment.Bottom,
                        horizontalArrangement = Arrangement.spacedBy(spacing.elementGapSm / 2),
                    ) {
                        OutlinedTextField(
                            value = draft,
                            onValueChange = { draft = it },
                            modifier = Modifier.weight(1f).heightIn(min = 48.dp, max = 128.dp),
                            enabled = state != AssistantUiState.Asking,
                            placeholder = {
                                Text(
                                    text = AssistantPanelCopy.PLACEHOLDER,
                                    style = type.small,
                                    color = RoyColors.mutedForeground,
                                )
                            },
                            textStyle = type.field(type.small),
                            shape = RoundedCornerShape(12.dp),
                            maxLines = 5,
                        )
                        IconButton(
                            onClick = ::send,
                            enabled =
                                state != AssistantUiState.Asking &&
                                    (draft.isNotBlank() || staged.isNotEmpty()),
                            modifier = Modifier.size(48.dp),
                        ) {
                            Icon(
                                imageVector = LucideVectors.Send,
                                contentDescription = AssistantPanelCopy.SEND,
                                tint =
                                    if (draft.isNotBlank() || staged.isNotEmpty()) {
                                        RoyColors.primary
                                    } else {
                                        RoyColors.mutedForeground
                                    },
                                modifier = Modifier.size(20.dp),
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun AssistantStatePanel(
    title: String,
    body: String?,
    action: String?,
    onAction: () -> Unit,
    orb: Boolean,
    loading: Boolean = false,
    failed: Boolean = false,
) {
    val type = LocalRoyTypeScale.current
    val spacing = LocalRoySpacing.current

    Column(
        modifier = Modifier.fillMaxWidth().padding(vertical = spacing.containerPadding),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(spacing.elementGapSm),
    ) {
        when {
            loading -> CircularProgressIndicator(color = RoyColors.primary)
            failed ->
                Icon(
                    imageVector = LucideVectors.CircleAlert,
                    contentDescription = null,
                    tint = RoyColors.destructive,
                    modifier = Modifier.size(32.dp),
                )
            orb -> AssistantMark(size = 64.dp)
        }
        Text(
            text = title,
            style = type.body.copy(fontWeight = FontWeight.Bold),
            color = RoyColors.foreground,
            textAlign = TextAlign.Center,
        )
        if (body != null) {
            Text(
                text = body,
                style = type.small,
                color = RoyColors.mutedForeground,
                textAlign = TextAlign.Center,
            )
        }
        if (action != null) {
            Button(onClick = onAction) {
                Text(text = action, style = type.small.copy(fontWeight = FontWeight.Bold))
            }
        }
    }
}

@Composable
private fun AssistantConversation(
    messages: List<ChatMessagePageResponseMessagesItem>,
    streaming: String,
    tools: List<String>,
    asking: Boolean,
    listState: LazyListState,
    type: RoyTypeScale,
    onOpenAttachment: (String) -> Unit,
    onPick: (String) -> Unit,
) {
    LazyColumn(
        state = listState,
        modifier = Modifier.fillMaxWidth().fillMaxHeight(),
        verticalArrangement = Arrangement.spacedBy(8.dp),
        contentPadding = PaddingValues(vertical = 8.dp),
    ) {
        if (messages.isEmpty() && !asking) {
            item {
                AssistantIntro(onPick = onPick)
            }
        }

        items(messages, key = { it.id }) { message ->
            AssistantMessage(message = message, type = type, onOpenAttachment = onOpenAttachment)
        }

        if (tools.isNotEmpty()) {
            item {
                Text(
                    text = tools.joinToString(" · "),
                    style = type.xs,
                    color = RoyColors.mutedForeground.copy(alpha = 0.7f),
                )
            }
        }

        if (asking) {
            item {
                AssistantBubble {
                    Text(
                        text = streaming.ifEmpty { AssistantPanelCopy.THINKING },
                        style = type.small,
                        color =
                            if (streaming.isEmpty()) {
                                RoyColors.mutedForeground
                            } else {
                                RoyColors.foreground
                            },
                    )
                }
            }
        }
    }
}

@Composable
private fun AssistantIntro(onPick: (String) -> Unit) {
    val type = LocalRoyTypeScale.current

    Column(
        modifier = Modifier.fillMaxWidth().padding(vertical = 8.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalAlignment = Alignment.Top,
        ) {
            AssistantMark(size = 32.dp)
            Text(
                text = AssistantPanelCopy.INTRO,
                style = type.small,
                color = RoyColors.foreground,
                modifier = Modifier.weight(1f),
            )
        }
        Text(
            text = AssistantPanelCopy.SUGGESTIONS_LABEL,
            style = type.xs.copy(fontWeight = FontWeight.Bold),
            color = RoyColors.mutedForeground,
        )
        listOf(
                AssistantPanelCopy.SUGGEST_SERVICE,
                AssistantPanelCopy.SUGGEST_COURSE,
                AssistantPanelCopy.SUGGEST_CONSULTATION,
            )
            .forEach { question ->
                Text(
                    text = question,
                    style = type.xs.copy(fontWeight = FontWeight.Bold),
                    color = RoyColors.foreground,
                    modifier =
                        Modifier
                            .clip(RoundedCornerShape(50))
                            .background(RoyColors.muted.copy(alpha = 0.6f))
                            .clickable { onPick(question) }
                            .padding(horizontal = 12.dp, vertical = 6.dp),
                )
            }
    }
}

@Composable
private fun AssistantMessage(
    message: ChatMessagePageResponseMessagesItem,
    type: RoyTypeScale,
    onOpenAttachment: (String) -> Unit,
) {
    val mine = message.senderKind == ChatMessagePageResponseMessagesItemSenderKind.USER

    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = if (mine) Arrangement.End else Arrangement.Start,
        verticalAlignment = Alignment.Top,
    ) {
        if (!mine && message.senderKind == ChatMessagePageResponseMessagesItemSenderKind.AGENT) {
            AssistantMark(size = 24.dp)
        }
        Column(
            modifier = Modifier.padding(start = if (mine) 0.dp else 6.dp).widthIn(max = 300.dp),
            horizontalAlignment = if (mine) Alignment.End else Alignment.Start,
        ) {
            Box(
                modifier =
                    Modifier
                        .clip(RoundedCornerShape(16.dp))
                        .background(
                            if (mine) RoyColors.primary else RoyColors.muted.copy(alpha = 0.7f)
                        )
                        .padding(horizontal = 12.dp, vertical = 8.dp),
            ) {
                Text(
                    text =
                        when {
                            message.deletedAt != null -> AssistantPanelCopy.ATTACHMENT_ONLY
                            !message.body.isNullOrBlank() -> message.body
                            message.attachments.isNotEmpty() -> AssistantPanelCopy.ATTACHMENT_ONLY
                            else -> ""
                        },
                    style = type.small,
                    color = if (mine) RoyColors.primaryForeground else RoyColors.foreground,
                )
            }
            message.attachments.forEach { attachment ->
                Text(
                    text = AssistantPanelCopy.DOWNLOAD_FILE.replace("{name}", attachment.fileName),
                    style = type.xs,
                    color = RoyColors.primary,
                    modifier =
                        Modifier
                            .padding(top = 4.dp)
                            .clip(RoundedCornerShape(8.dp))
                            .clickable { onOpenAttachment(attachment.id) }
                            .padding(horizontal = 6.dp, vertical = 4.dp),
                )
            }
        }
    }
}

@Composable
private fun AssistantBubble(content: @Composable () -> Unit) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.Start,
        verticalAlignment = Alignment.Top,
    ) {
        AssistantMark(size = 24.dp)
        Box(
            modifier =
                Modifier
                    .padding(start = 6.dp)
                    .widthIn(max = 300.dp)
                    .clip(RoundedCornerShape(16.dp))
                    .background(RoyColors.muted.copy(alpha = 0.7f))
                    .padding(horizontal = 12.dp, vertical = 8.dp),
        ) {
            content()
        }
    }
}
