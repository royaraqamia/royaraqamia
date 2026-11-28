package com.royaraqamia.app.assistant

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
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
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.royaraqamia.app.chats.AssistantMark
import com.royaraqamia.app.chats.ChatAttachmentStage
import com.royaraqamia.app.chats.ChatAttachments
import com.royaraqamia.app.chats.ChatComposeFile
import com.royaraqamia.app.chats.ChatComposerAttach
import com.royaraqamia.app.chats.ChatFailure
import com.royaraqamia.app.chats.ChatMessageList
import com.royaraqamia.app.chats.WebSourcesCard
import com.royaraqamia.app.chats.ChatThreadCopy
import com.royaraqamia.app.chats.ChatsRepository
import com.royaraqamia.app.contracts.ApiResult
import com.royaraqamia.app.contracts.generated.ChatAgentActionStatus
import com.royaraqamia.app.contracts.generated.ChatMessagePageResponseMessagesItem
import com.royaraqamia.app.contracts.generated.ChatMessagePageResponseMessagesItemSenderKind
import com.royaraqamia.app.contracts.generated.ChatThreadResponseThread
import com.royaraqamia.app.contracts.generated.ChatThreadsResponseThreadsItemKind
import com.royaraqamia.app.theme.LocalRoySpacing
import com.royaraqamia.app.theme.LocalRoyTypeScale
import com.royaraqamia.app.theme.RoyColors
import com.royaraqamia.app.theme.RoyTypeScale
import com.royaraqamia.app.ui.vectors.LucideVectors
import kotlinx.coroutines.launch

/** The handle a UI test finds the sheet by. */
const val ASSISTANT_SHEET_TAG = "assistant-sheet"

/**
 * نور's floating conversation, on the app's own frame (ADR-0143).
 *
 * It is the sheet the corner's door opens: the member's thread, streamed a frame
 * at a time, with the same states the site's panel draws — guest, no provider,
 * loading, failed, ready, asking — and the same words from `AssistantPanelCopy`.
 * The thread is created on open (`startAssistant` is idempotent), read through
 * the chats repository, and written through the assistant's streamed turn.
 *
 * A proposal (#1182) is drawn under its message from the page's own rows: the
 * sentence is the assistant's line the server wrote, the status and the two
 * answers come from `shared/copy`, and confirming or declining calls the same
 * route the page calls. The header's link opens the full conversation; it is no
 * longer the only way to answer.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AssistantSheet(
    repository: ChatsRepository,
    /** The turns that outlive this sheet (ADR-0173). */
    turns: AssistantTurnStore,
    signedIn: Boolean,
    /** What the shell last painted; null on the first open of this process. */
    snapshot: AssistantSnapshot?,
    /** Records the page the shell keeps for the next open (ADR-0150). */
    onSnapshot: (AssistantSnapshot) -> Unit,
    onDismiss: () -> Unit,
    onSignIn: () -> Unit,
    onOpenAttachment: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    val scope = rememberCoroutineScope()
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    val spacing = LocalRoySpacing.current
    val type = LocalRoyTypeScale.current
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
    var header by remember { mutableStateOf<ChatThreadResponseThread?>(null) }
    var messages by remember { mutableStateOf(snapshot?.messages ?: emptyList()) }
    var actions by remember { mutableStateOf<List<AssistantAction>>(emptyList()) }
    var actionBusy by remember { mutableStateOf(false) }
    var cursor by remember { mutableStateOf<String?>(null) }
    var hasOlder by remember { mutableStateOf(false) }
    var editing by remember { mutableStateOf<String?>(null) }
    var editingText by remember { mutableStateOf("") }
    var deleting by remember { mutableStateOf<String?>(null) }
    var deletingBusy by remember { mutableStateOf(false) }
    var available by remember { mutableStateOf(snapshot?.available ?: true) }
    var allowance by remember { mutableStateOf(snapshot?.allowance) }
    var openActions by remember { mutableStateOf(0L) }
    var notice by remember { mutableStateOf<String?>(null) }
    var draft by remember { mutableStateOf("") }
    var staged by remember { mutableStateOf<List<ChatComposeFile>>(emptyList()) }
    var attempt by remember { mutableIntStateOf(0) }

    val running by turns.turns.collectAsState()
    val turn = threadId?.let { running[it] }
    val asking = turn?.phase != null
    /** The face to draw: a running turn outranks the last settled state. */
    val shownState = if (asking) AssistantUiState.Asking else state

    /**
     * The one line under the name (ADR-0173): the turn's phase while it runs,
     * and "waiting for you" once a proposal is open. The stream's phase is the
     * first answer; the page's rows are the record once the turn settles.
     */
    val phaseLine =
        when (turn?.phase) {
            AssistantPhase.Thinking -> AssistantPanelCopy.THINKING
            AssistantPhase.Writing -> AssistantPanelCopy.WRITING
            AssistantPhase.Tool -> turn?.toolLabel
            AssistantPhase.Proposal -> AssistantPanelCopy.NEEDS_YOU
            null ->
                if (openActions > 0 ||
                    actions.any { it.status == ChatAgentActionStatus.PROPOSED }
                ) {
                    AssistantPanelCopy.NEEDS_YOU
                } else {
                    null
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
        when (val read = repository.thread(id)) {
            is ApiResult.Success -> {
                header = read.value
                quota = read.value.attachmentQuota
                openActions = read.value.openActions ?: 0
            }
            is ApiResult.Failure -> readFailed = true
        }
        when (val page = repository.messages(id)) {
            is ApiResult.Success -> {
                messages = page.value.messages
                actions = page.value.actions.map { it.asAssistantAction() }
                cursor = page.value.nextCursor
                hasOlder = page.value.nextCursor != null
                repository.markRead(id)
            }
            is ApiResult.Failure -> readFailed = true
        }
        return readFailed
    }

    /** The page above the one on screen: the reader's own request, not a clock. */
    suspend fun loadOlder() {
        val id = threadId ?: return
        val before = cursor ?: return
        when (val page = repository.messages(id, before)) {
            is ApiResult.Success -> {
                messages = (page.value.messages + messages).distinctBy { it.id }
                actions =
                    (actions + page.value.actions.map { it.asAssistantAction() })
                        .distinctBy { it.id }
                cursor = page.value.nextCursor
                hasOlder = page.value.nextCursor != null
                notice = null
            }
            is ApiResult.Failure ->
                notice = ChatFailure.sentenceOf(page.error) ?: AssistantPanelCopy.FAILED
        }
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
                        else -> AssistantUiState.Ready
                    }
                publish()
            }
            is ApiResult.Failure -> state = AssistantUiState.Failed
        }
    }

    // A turn settles in the store, which may be while this sheet is closed. The
    // stored row is the record, so the thread is read again when it ends.
    LaunchedEffect(threadId, turn?.settledAt) {
        val id = threadId ?: return@LaunchedEffect
        if ((turn?.settledAt ?: 0L) == 0L) return@LaunchedEffect
        load(id)
        refreshAssistant()
        state =
            when {
                !available -> AssistantUiState.Unavailable
                else -> AssistantUiState.Ready
            }
        publish()
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
        // A follow-up while the answer runs stops it; the turn store owns that.
        val body = draft.trim()
        val files = staged
        if (body.isEmpty() && files.isEmpty()) return

        draft = ""
        staged = emptyList()
        notice = null
        turns.start(id, body, files)
    }

    /** The two answers a proposal offers, written through the same route as the page. */
    fun answerAction(actionId: String, answer: String) {
        val id = threadId ?: return
        if (actionBusy) return
        actionBusy = true
        scope.launch {
            val result =
                if (answer == "confirm") {
                    repository.confirmAgentAction(id, actionId)
                } else {
                    repository.rejectAgentAction(id, actionId)
                }
            when (result) {
                is ApiResult.Success -> {
                    actions = actions.map { if (it.id == actionId) result.value else it }
                    openActions = (openActions - 1).coerceAtLeast(0)
                    notice = null
                }
                is ApiResult.Failure ->
                    notice =
                        ChatFailure.sentenceOf(result.error)
                            ?: AssistantPanelCopy.FAILED
            }
            actionBusy = false
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
                    /*
                      The slot is always reserved, so the header does not jump when
                      a turn starts; it is the sheet's one live line (ADR-0173).
                    */
                    Text(
                        text = phaseLine.orEmpty(),
                        style = type.xs,
                        color = RoyColors.primary,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.heightIn(min = 16.dp),
                    )
                }
            }

            Box(Modifier.weight(1f).fillMaxWidth()) {
                when (shownState) {
                    AssistantUiState.Guest ->
                        AssistantStatePanel(
                            title = AssistantName.inText(AssistantPanelCopy.GUEST_TITLE),
                            body = AssistantPanelCopy.GUEST_BODY,
                            action = AssistantPanelCopy.SIGN_IN,
                            onAction = onSignIn,
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
                            header = header,
                            messages = messages,
                            actions = actions,
                            onActionAnswer = ::answerAction,
                            actionBusy = actionBusy,
                            streaming = turn?.streaming.orEmpty(),
                            interrupted = turn?.interrupted.orEmpty(),
                            tools = turn?.tools.orEmpty(),
                            sources = turn?.sources.orEmpty(),
                            asking = asking,
                            editing = editing,
                            editText = editingText,
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
                                            notice = null
                                            threadId?.let { load(it) }
                                        }
                                        is ApiResult.Failure ->
                                            notice =
                                                ChatFailure.sentenceOf(result.error)
                                                    ?: AssistantPanelCopy.FAILED
                                    }
                                }
                            },
                            onDelete = { message -> deleting = message.id },
                            hasOlder = hasOlder,
                            onLoadOlder = { scope.launch { loadOlder() } },
                            type = type,
                            onOpenAttachment = ::openAttachment,
                        )
                }
            }

            (turn?.notice ?: notice)?.let { sentence ->
                Text(
                    text = sentence,
                    style = type.xs,
                    color = RoyColors.mutedForeground,
                    modifier = Modifier.padding(vertical = spacing.elementGapSm / 2),
                )
            }

            if (shownState == AssistantUiState.Ready || shownState == AssistantUiState.Asking) {
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
                            enabled = true,
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
                            enabled = true,
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
                        val hasQuestion = draft.isNotBlank() || staged.isNotEmpty()
                        if (asking && !hasQuestion) {
                            IconButton(
                                onClick = { threadId?.let(turns::stop) },
                                modifier = Modifier.size(48.dp),
                            ) {
                                Icon(
                                    imageVector = LucideVectors.Square,
                                    contentDescription = AssistantPanelCopy.STOP,
                                    tint = RoyColors.primary,
                                    modifier = Modifier.size(20.dp),
                                )
                            }
                        } else {
                            IconButton(
                                onClick = ::send,
                                enabled = hasQuestion,
                                modifier = Modifier.size(48.dp),
                            ) {
                                Icon(
                                    imageVector = LucideVectors.Send,
                                    contentDescription = AssistantPanelCopy.SEND,
                                    tint =
                                        if (hasQuestion) RoyColors.primary
                                        else RoyColors.mutedForeground,
                                    modifier = Modifier.size(20.dp),
                                )
                            }
                        }
                    }
                }
            }
        }
    }

    // The one write the sheet keeps a dialog for: the row's own control is one
    // tap, and a tombstone is not undoable.
    val doomed = deleting
    if (doomed != null) {
        AlertDialog(
            onDismissRequest = { if (!deletingBusy) deleting = null },
            title = { Text(ChatThreadCopy.DELETE_MESSAGE_TITLE) },
            text = {
                Text(
                    text = ChatThreadCopy.DELETE_MESSAGE_MESSAGE,
                    style = LocalRoyTypeScale.current.small,
                )
            },
            confirmButton = {
                TextButton(
                    enabled = !deletingBusy,
                    onClick = {
                        val id = threadId ?: return@TextButton
                        scope.launch {
                            deletingBusy = true
                            when (val result = repository.delete(doomed)) {
                                is ApiResult.Success -> {
                                    notice = null
                                    load(id)
                                }
                                is ApiResult.Failure ->
                                    notice =
                                        ChatFailure.sentenceOf(result.error)
                                            ?: AssistantPanelCopy.FAILED
                            }
                            deletingBusy = false
                            deleting = null
                        }
                    },
                ) {
                    Text(text = ChatThreadCopy.DELETE)
                }
            },
            dismissButton = {
                TextButton(onClick = { deleting = null }, enabled = !deletingBusy) {
                    Text(text = ChatThreadCopy.CANCEL)
                }
            },
        )
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
    header: ChatThreadResponseThread?,
    messages: List<ChatMessagePageResponseMessagesItem>,
    actions: List<AssistantAction>,
    onActionAnswer: (String, String) -> Unit,
    actionBusy: Boolean,
    streaming: String,
    interrupted: String,
    tools: List<String>,
    sources: List<AssistantSource>,
    asking: Boolean,
    editing: String?,
    editText: String,
    onEditStart: (ChatMessagePageResponseMessagesItem) -> Unit,
    onEditText: (String) -> Unit,
    onEditCancel: () -> Unit,
    onEditSave: (ChatMessagePageResponseMessagesItem) -> Unit,
    onDelete: (ChatMessagePageResponseMessagesItem) -> Unit,
    hasOlder: Boolean,
    onLoadOlder: () -> Unit,
    type: RoyTypeScale,
    onOpenAttachment: (String) -> Unit,
) {
    ChatMessageList(
        thread = header,
        messages = messages,
        mine = { message ->
            message.senderKind == ChatMessagePageResponseMessagesItemSenderKind.USER
        },
        onDownload = onOpenAttachment,
        actions = actions,
        onActionAnswer = onActionAnswer,
        busyActions = actionBusy,
        editing = editing,
        editText = editText,
        onEditStart = onEditStart,
        onEditText = onEditText,
        onEditCancel = onEditCancel,
        onEditSave = onEditSave,
        onDelete = onDelete,
        hasOlder = hasOlder,
        onLoadOlder = onLoadOlder,
        emptyBody = AssistantPanelCopy.ATTACHMENT_ONLY,
        followKey = listOf(messages.size, asking, streaming.length, interrupted.length, tools.size),
        modifier = Modifier.fillMaxWidth().fillMaxHeight(),
        intro = if (messages.isEmpty() && !asking) {
            { AssistantIntro() }
        } else {
            null
        },
        trailing = {
            if (tools.isNotEmpty()) {
                Provenance(tools = tools, type = type)
            }
            if (asking && streaming.isNotEmpty()) {
                AssistantBubble {
                    Text(
                        text = streaming,
                        style = type.small,
                        color = RoyColors.foreground,
                    )
                }
                WebSourcesCard(
                    sources = sources,
                    type = type,
                    readNote = !Regex("\\[\\d{1,2}\\]").containsMatchIn(streaming),
                )
            }
            // A stopped answer keeps what the member already read, named as
            // unfinished — the same line the site draws under a partial answer.
            if (interrupted.isNotEmpty()) {
                AssistantBubble {
                    Text(
                        text = interrupted,
                        style = type.small,
                        color = RoyColors.foreground,
                    )
                }
                Text(
                    text = AssistantPanelCopy.INTERRUPTED,
                    style = type.xs,
                    color = RoyColors.mutedForeground,
                )
            }
        },
    )
}

/**
 * What the answer read, folded away: provenance explains the answer, it is not
 * a second live line (ADR-0173). The header carries what is happening now.
 */
@Composable
private fun Provenance(tools: List<String>, type: RoyTypeScale) {
    var open by remember { mutableStateOf(false) }
    Column(Modifier.fillMaxWidth()) {
        Text(
            text = AssistantPanelCopy.PROVENANCE,
            style = type.xs,
            color = RoyColors.mutedForeground.copy(alpha = 0.7f),
            modifier = Modifier.clickable { open = !open },
        )
        if (open) {
            Text(
                text = tools.joinToString(" · "),
                style = type.xs,
                color = RoyColors.mutedForeground.copy(alpha = 0.7f),
                modifier = Modifier.padding(top = 2.dp),
            )
        }
    }
}

@Composable
private fun AssistantIntro() {
    val type = LocalRoyTypeScale.current

    Column(
        modifier = Modifier.fillMaxWidth().padding(vertical = 8.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        AssistantMark(size = 32.dp)
        Text(
            text = AssistantPanelCopy.TITLE,
            style = type.small.copy(fontWeight = FontWeight.Bold),
            color = RoyColors.foreground,
        )
        Text(
            text = AssistantName.inText(AssistantPanelCopy.INTRO),
            style = type.small,
            color = RoyColors.mutedForeground.copy(alpha = 0.8f),
            textAlign = TextAlign.Center,
        )
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


