package com.royaraqamia.app.chats

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.Icon
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.royaraqamia.app.contracts.ApiResult
import com.royaraqamia.app.contracts.generated.ChatMembersResponseMembersItem
import com.royaraqamia.app.theme.LocalRoySpacing
import com.royaraqamia.app.theme.LocalRoyTypeScale
import com.royaraqamia.app.theme.Recipes
import com.royaraqamia.app.theme.RoyColors
import com.royaraqamia.app.ui.vectors.LucideVectors
import kotlinx.coroutines.launch

/**
 * The site's new-conversation panel as a screen (#934).
 *
 * It is the app's half of `frontend/ui/chats/new-conversation-panel.tsx`: the two
 * modes, the member directory's search and its answers, the direct picker that
 * opens a member's empty chat screen, and the group form with its name and 1-31
 * invitees. Every sentence comes from [ChatNewCopy], generated from the file the
 * site's module is generated from.
 *
 * The direct row does not write: the site's `/chats/new?to=<handle>` screen sends
 * the request from its own button, so a pick never starts a conversation on the
 * member's behalf. A group is created on the click and the thread it just made is
 * opened, never the list.
 *
 * The screen is drawn with the page's member ceiling in one place: zero invitees
 * is the page's "add one" sentence, more than the contract allows is the schema's
 * own sentence, and the count line names the same ceiling both clients print.
 */
@Composable
fun ChatNewScreen(
    repository: ChatsRepository,
    modifier: Modifier = Modifier,
    onOpenPeer: (String) -> Unit = {},
    onOpenThread: (String) -> Unit = {},
) {
    ChatNewScreen(
        searchMembers = { query -> repository.members(query) },
        createGroup = { title, memberIds -> repository.createGroup(title, memberIds) },
        onOpenPeer = onOpenPeer,
        onOpenThread = onOpenThread,
        modifier = modifier,
    )
}

/**
 * The screen over the calls it makes, so it can be drawn in a test without a
 * client: the same shape `ConsultationScreen` uses for its two reads.
 */
@Composable
internal fun ChatNewScreen(
    searchMembers: suspend (String) -> ApiResult<List<ChatMembersResponseMembersItem>>,
    createGroup: suspend (String, List<String>) -> ApiResult<String>,
    onOpenPeer: (String) -> Unit,
    onOpenThread: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    val spacing = LocalRoySpacing.current
    val type = LocalRoyTypeScale.current
    val scope = rememberCoroutineScope()

    var mode by remember { mutableStateOf<ChatNewUiState>(ChatNewUiState.Direct) }
    var term by remember { mutableStateOf("") }
    var results by remember { mutableStateOf<List<ChatMembersResponseMembersItem>>(emptyList()) }
    var searching by remember { mutableStateOf(false) }
    var selected by remember { mutableStateOf<List<ChatMembersResponseMembersItem>>(emptyList()) }
    var title by remember { mutableStateOf("") }
    var error by remember { mutableStateOf<String?>(null) }
    var creating by remember { mutableStateOf(false) }

    val state = ChatNewUiState.of(mode == ChatNewUiState.Group)

    // The directory answers from two characters, the same threshold the site's
    // picker uses. A new keystroke cancels the previous request.
    LaunchedEffect(term) {
        if (term.trim().length < MEMBER_SEARCH_MIN_LENGTH) {
            results = emptyList()
            searching = false
            return@LaunchedEffect
        }
        searching = true
        results =
            when (val answer = searchMembers(term.trim())) {
                is ApiResult.Success -> answer.value
                is ApiResult.Failure -> emptyList()
            }
        searching = false
    }

    fun chooseMode(next: ChatNewUiState) {
        if (mode == next) return
        mode = next
        term = ""
        results = emptyList()
        error = null
    }

    fun toggle(peer: ChatMembersResponseMembersItem) {
        selected =
            if (selected.any { it.id == peer.id }) {
                selected.filterNot { it.id == peer.id }
            } else {
                selected + peer
            }
        error = null
    }

    fun create() {
        if (creating) return
        groupTitleError(title)?.let {
            error = it
            return
        }
        groupMembersError(selected.size)?.let {
            error = it
            return
        }

        scope.launch {
            creating = true
            error = null
            when (val answer = createGroup(title.trim(), selected.map { it.id })) {
                is ApiResult.Success -> onOpenThread(answer.value)
                is ApiResult.Failure ->
                    error = ChatFailure.sentenceOf(answer.error) ?: ChatNewCopy.GROUP_CREATE_FAILED
            }
            creating = false
        }
    }

    Column(
        modifier =
            modifier
                .fillMaxSize()
                .background(RoyColors.background)
                .padding(horizontal = spacing.containerPadding, vertical = spacing.elementGapSm),
        verticalArrangement = Arrangement.spacedBy(spacing.elementGapSm),
    ) {
        Text(
            text = ChatsListCopy.NEW_CHAT,
            style = type.h3.copy(fontWeight = FontWeight.Bold),
            color = RoyColors.foreground,
        )

        Row(
            modifier = Modifier.testTag(ChatNewTags.TABS),
            horizontalArrangement = Arrangement.spacedBy(spacing.elementGapSm / 2),
        ) {
            ModeTab(
                label = ChatNewCopy.TYPE_DIRECT,
                selected = state == ChatNewUiState.Direct,
                tag = ChatNewTags.DIRECT_TAB,
                onClick = { chooseMode(ChatNewUiState.Direct) },
            )
            ModeTab(
                label = ChatNewCopy.TYPE_GROUP,
                selected = state == ChatNewUiState.Group,
                tag = ChatNewTags.GROUP_TAB,
                onClick = { chooseMode(ChatNewUiState.Group) },
            )
        }

        if (state == ChatNewUiState.Group) {
            OutlinedTextField(
                value = title,
                onValueChange = {
                    title = it
                    error = null
                },
                singleLine = true,
                label = { Text(text = ChatNewCopy.GROUP_NAME, style = type.xs) },
                modifier = Modifier.fillMaxWidth().testTag(ChatNewTags.GROUP_TITLE),
            )
        }

        OutlinedTextField(
            value = term,
            onValueChange = { term = it },
            singleLine = true,
            placeholder = { Text(text = ChatNewCopy.SEARCH_PLACEHOLDER, style = type.xs) },
            leadingIcon = {
                Icon(
                    imageVector = LucideVectors.Search,
                    contentDescription = ChatNewCopy.SEARCH_LABEL,
                    tint = RoyColors.mutedForeground,
                    modifier = Modifier.size(Recipes.Glyph.sm),
                )
            },
            modifier = Modifier.fillMaxWidth().testTag(ChatNewTags.SEARCH),
        )

        if (state == ChatNewUiState.Group && selected.isNotEmpty()) {
            SelectedMembers(
                members = selected,
                onRemove = ::toggle,
            )
        }

        Box(modifier = Modifier.weight(1f)) {
            when {
                searching ->
                    Text(
                        text = ChatNewCopy.SEARCHING,
                        style = type.xs,
                        color = RoyColors.mutedForeground,
                        modifier = Modifier.padding(top = spacing.elementGapSm),
                    )
                results.isEmpty() && term.trim().length >= MEMBER_SEARCH_MIN_LENGTH ->
                    Text(
                        text = ChatNewCopy.NO_RESULTS,
                        style = type.xs,
                        color = RoyColors.mutedForeground,
                        modifier = Modifier.padding(top = spacing.elementGapSm),
                    )
                else ->
                    LazyColumn(verticalArrangement = Arrangement.spacedBy(spacing.elementGapSm / 2)) {
                        items(results, key = { it.id }) { peer ->
                            ResultRow(
                                peer = peer,
                                multiple = state == ChatNewUiState.Group,
                                picked = selected.any { it.id == peer.id },
                                onClick = {
                                    if (state == ChatNewUiState.Group) toggle(peer)
                                    else onOpenPeer(peer.username)
                                },
                            )
                        }
                    }
            }
        }

        if (error != null) {
            Text(
                text = error.orEmpty(),
                style = type.xs.copy(fontWeight = FontWeight.Medium),
                color = RoyColors.destructive,
                modifier = Modifier.testTag(ChatNewTags.ERROR),
            )
        }

        if (state == ChatNewUiState.Group) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    text =
                        ChatNewCopy.GROUP_LIMIT.replace(
                            "{count}",
                            (GROUP_MEMBERS_MAX - 1).toString(),
                        ),
                    style = type.xs,
                    color = RoyColors.mutedForeground.copy(alpha = 0.7f),
                    modifier = Modifier.testTag(ChatNewTags.LIMIT),
                )
                Button(
                    onClick = ::create,
                    enabled = !creating,
                    modifier = Modifier.testTag(ChatNewTags.CREATE),
                ) {
                    Text(
                        text = if (creating) ChatNewCopy.GROUP_CREATING else ChatNewCopy.GROUP_CREATE,
                        style = type.xs.copy(fontWeight = FontWeight.Bold),
                    )
                }
            }
        }
    }
}

/** One of the panel's two modes: the site's tab, in its selected state. */
@Composable
private fun ModeTab(
    label: String,
    selected: Boolean,
    tag: String,
    onClick: () -> Unit,
) {
    val type = LocalRoyTypeScale.current
    val spacing = LocalRoySpacing.current

    Text(
        text = label,
        style = type.xs.copy(fontWeight = FontWeight.Bold),
        color = if (selected) RoyColors.primaryForeground else RoyColors.mutedForeground,
        modifier =
            Modifier.testTag(tag)
                .background(
                    if (selected) RoyColors.primary else RoyColors.muted.copy(alpha = 0.4f),
                    RoundedCornerShape(8.dp),
                )
                .selectable(selected = selected, onClick = onClick, role = Role.Tab)
                .padding(horizontal = spacing.elementGapSm, vertical = 6.dp),
    )
}

/** One directory row: the member's face by name and handle, and the pick. */
@Composable
private fun ResultRow(
    peer: ChatMembersResponseMembersItem,
    multiple: Boolean,
    picked: Boolean,
    onClick: () -> Unit,
) {
    val type = LocalRoyTypeScale.current
    val spacing = LocalRoySpacing.current

    Row(
        modifier =
            Modifier.testTag(ChatNewTags.result(peer.id))
                .fillMaxWidth()
                .border(1.dp, RoyColors.border.copy(alpha = 0.7f), Recipes.Card.radius)
                .background(Recipes.Card.container, Recipes.Card.radius)
                .clickable(role = Role.Button, onClick = onClick)
                .padding(horizontal = spacing.elementGapSm, vertical = spacing.elementGapSm),
        horizontalArrangement = Arrangement.spacedBy(spacing.elementGapSm),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            modifier =
                Modifier.size(36.dp)
                    .border(1.dp, RoyColors.border.copy(alpha = 0.4f), CircleShape)
                    .background(RoyColors.muted.copy(alpha = 0.5f), CircleShape),
            contentAlignment = Alignment.Center,
        ) {
            Text(
                text = (peer.name ?: peer.username).take(1),
                style = type.small.copy(fontWeight = FontWeight.Bold),
                color = RoyColors.mutedForeground,
            )
        }

        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = peer.name ?: peer.username,
                style = type.small.copy(fontWeight = FontWeight.Bold),
                color = RoyColors.foreground,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            Text(
                text = "@${peer.username}",
                style = type.xs,
                color = RoyColors.mutedForeground.copy(alpha = 0.7f),
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }

        if (multiple) {
            Icon(
                imageVector = LucideVectors.Check,
                contentDescription = null,
                tint = if (picked) RoyColors.primary else RoyColors.border,
                modifier = Modifier.size(Recipes.Glyph.sm),
            )
        }
    }
}

/** The picked invitees: a chip per member, with the site's remove control. */
@Composable
private fun SelectedMembers(
    members: List<ChatMembersResponseMembersItem>,
    onRemove: (ChatMembersResponseMembersItem) -> Unit,
) {
    val type = LocalRoyTypeScale.current
    val spacing = LocalRoySpacing.current

    Column(
        modifier = Modifier.fillMaxWidth(),
        verticalArrangement = Arrangement.spacedBy(spacing.elementGapSm / 2),
    ) {
        Text(
            text = ChatNewCopy.INVITEES,
            style = type.xs.copy(fontWeight = FontWeight.Bold),
            color = RoyColors.mutedForeground,
        )
        members.forEach { member ->
            val name = member.name ?: member.username
            Row(
                modifier =
                    Modifier.testTag(ChatNewTags.member(member.id))
                        .fillMaxWidth()
                        .border(1.dp, RoyColors.border.copy(alpha = 0.4f), RoundedCornerShape(8.dp))
                        .background(RoyColors.muted.copy(alpha = 0.4f), RoundedCornerShape(8.dp))
                        .padding(horizontal = spacing.elementGapSm, vertical = 4.dp),
                horizontalArrangement = Arrangement.spacedBy(spacing.elementGapSm),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    text = name,
                    style = type.xs,
                    color = RoyColors.foreground,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.weight(1f),
                )
                Icon(
                    imageVector = LucideVectors.X,
                    contentDescription = ChatNewCopy.REMOVE_INVITEE.replace("{name}", name),
                    tint = RoyColors.mutedForeground,
                    modifier =
                        Modifier.size(Recipes.Glyph.sm).clickable(role = Role.Button) {
                            onRemove(member)
                        },
                )
            }
        }
    }
}

/** The group's name rule: the page refuses an empty title before any write. */
internal fun groupTitleError(title: String): String? =
    if (title.trim().isEmpty()) ChatNewCopy.GROUP_NAME_REQUIRED else null

/**
 * The group's member rule, at the same two boundaries the page draws: none is
 * the page's "add one", and past the contract's ceiling is the schema's own
 * sentence. One to thirty-one is a group.
 */
internal fun groupMembersError(count: Int): String? =
    when {
        count <= 0 -> ChatNewCopy.GROUP_MEMBERS_REQUIRED
        count > GROUP_MEMBERS_MAX - 1 -> ChatNewCopy.TOO_MANY_MEMBERS
        else -> null
    }

/** The contract's ceiling on a group's members (`CHAT_GROUP_MEMBERS_MAX`). */
private const val GROUP_MEMBERS_MAX = 32

/** The shortest search the directory answers, the site's own threshold. */
private const val MEMBER_SEARCH_MIN_LENGTH = 2

/** The tags the screen's own test drives it by. */
internal object ChatNewTags {
    const val TABS = "chat-new-tabs"
    const val DIRECT_TAB = "chat-new-direct"
    const val GROUP_TAB = "chat-new-group"
    const val SEARCH = "chat-new-search"
    const val GROUP_TITLE = "chat-new-title"
    const val CREATE = "chat-new-create"
    const val ERROR = "chat-new-error"
    const val LIMIT = "chat-new-limit"

    fun result(id: String): String = "chat-new-result-$id"

    fun member(id: String): String = "chat-new-member-$id"
}
