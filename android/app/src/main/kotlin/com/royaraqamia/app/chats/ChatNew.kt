package com.royaraqamia.app.chats

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
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
import androidx.compose.material3.Icon
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.royaraqamia.app.contracts.ApiResult
import com.royaraqamia.app.contracts.generated.ChatMembersResponseMembersItem
import com.royaraqamia.app.theme.LocalRoySpacing
import com.royaraqamia.app.theme.LocalRoyTypeScale
import com.royaraqamia.app.theme.Recipes
import com.royaraqamia.app.theme.RoyColors
import com.royaraqamia.app.ui.vectors.LucideVectors

/**
 * The site's new-conversation panel as a screen (#934).
 *
 * It is the app's half of `frontend/ui/chats/new-conversation-panel.tsx`: the
 * member directory's search and its answers. The direct picker opens a member's
 * empty chat screen; it does not write. Every sentence comes from [ChatNewCopy],
 * generated from the file the site's module is generated from.
 */
@Composable
fun ChatNewScreen(
    repository: ChatsRepository,
    modifier: Modifier = Modifier,
    onOpenPeer: (String) -> Unit = {},
) {
    ChatNewScreen(
        searchMembers = { query -> repository.members(query) },
        onOpenPeer = onOpenPeer,
        modifier = modifier,
    )
}

/**
 * The screen over the call it makes, so it can be drawn in a test without a
 * client: the same shape `ConsultationScreen` uses for its two reads.
 */
@Composable
internal fun ChatNewScreen(
    searchMembers: suspend (String) -> ApiResult<List<ChatMembersResponseMembersItem>>,
    onOpenPeer: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    val spacing = LocalRoySpacing.current
    val type = LocalRoyTypeScale.current

    var term by remember { mutableStateOf("") }
    var results by remember { mutableStateOf<List<ChatMembersResponseMembersItem>>(emptyList()) }
    var searching by remember { mutableStateOf(false) }

    val state =
        when {
            searching -> ChatNewUiState.Searching
            term.trim().length >= MEMBER_SEARCH_MIN_LENGTH && results.isEmpty() ->
                ChatNewUiState.NoResults
            else -> ChatNewUiState.Search
        }

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

        Box(modifier = Modifier.weight(1f)) {
            when (state) {
                ChatNewUiState.Searching ->
                    Text(
                        text = ChatNewCopy.SEARCHING,
                        style = type.xs,
                        color = RoyColors.mutedForeground,
                        modifier = Modifier.padding(top = spacing.elementGapSm),
                    )
                ChatNewUiState.NoResults ->
                    Text(
                        text = ChatNewCopy.NO_RESULTS,
                        style = type.xs,
                        color = RoyColors.mutedForeground,
                        modifier = Modifier.padding(top = spacing.elementGapSm),
                    )
                ChatNewUiState.Search ->
                    LazyColumn(verticalArrangement = Arrangement.spacedBy(spacing.elementGapSm / 2)) {
                        items(results, key = { it.id }) { peer ->
                            ResultRow(peer = peer, onClick = { onOpenPeer(peer.username) })
                        }
                    }
            }
        }
    }
}

/** One directory row: the member's face by name and handle, and the pick. */
@Composable
private fun ResultRow(peer: ChatMembersResponseMembersItem, onClick: () -> Unit) {
    val type = LocalRoyTypeScale.current
    val spacing = LocalRoySpacing.current

    Row(
        modifier =
            Modifier.testTag(ChatNewTags.result(peer.id))
                .fillMaxWidth()
                .border(1.dp, RoyColors.border.copy(alpha = 0.7f), Recipes.Card.radius)
                .background(Recipes.Card.container, Recipes.Card.radius)
                .clickable(onClick = onClick)
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
    }
}

/** The shortest search the directory answers, the site's own threshold. */
private const val MEMBER_SEARCH_MIN_LENGTH = 2

/** The tags the screen's own test drives it by. */
internal object ChatNewTags {
    const val SEARCH = "chat-new-search"

    fun result(id: String): String = "chat-new-result-$id"
}
