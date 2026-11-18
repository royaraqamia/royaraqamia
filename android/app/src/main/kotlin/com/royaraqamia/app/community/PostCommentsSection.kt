package com.royaraqamia.app.community

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
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
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.TextRange
import androidx.compose.ui.text.input.TextFieldValue
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import coil.compose.AsyncImage
import com.royaraqamia.app.chats.insertChatLink
import com.royaraqamia.app.chats.toggleChatMark
import com.royaraqamia.app.contracts.ApiResult
import com.royaraqamia.app.contracts.generated.CreateCommentResponseComment
import com.royaraqamia.app.contracts.generated.PostCommentsResponseCommentsItem
import com.royaraqamia.app.contracts.generated.PostCommentsResponseCommentsItemAuthor
import com.royaraqamia.app.theme.LocalRoySpacing
import com.royaraqamia.app.theme.LocalRoyTypeScale
import com.royaraqamia.app.theme.RoyColors
import com.royaraqamia.app.ui.vectors.LucideVectors
import kotlinx.coroutines.launch

/**
 * The post's thread (#1573), the app's half of
 * `app/community/[slug]/_components/post-comments.tsx`.
 *
 * The page reads the thread on the client so a comment written a second ago does
 * not wait for the document's revalidation; the app does the same through the
 * same route, so the two clients page a thread identically. A write prepends its
 * own row and settles the action bar's number from the server's count, which is
 * the only number that survives a second device.
 *
 * A guest reads and is asked to sign in to write — the sentence is the page's.
 */
@Composable
internal fun PostCommentsSection(
    slug: String,
    repository: PostEngagementRepository,
    composer: CommentComposerState,
    currentUserId: String?,
    onCountChanged: (Long) -> Unit,
    modifier: Modifier = Modifier,
) {
    val spacing = LocalRoySpacing.current
    val type = LocalRoyTypeScale.current
    val scope = rememberCoroutineScope()

    var comments by remember(slug) { mutableStateOf<List<PostCommentsResponseCommentsItem>>(emptyList()) }
    var nextCursor by remember(slug) { mutableStateOf<String?>(null) }
    var total by remember(slug) { mutableStateOf(0L) }
    var loading by remember(slug) { mutableStateOf(true) }
    var failed by remember(slug) { mutableStateOf(false) }
    var openingMore by remember(slug) { mutableStateOf(false) }
    var editingId by remember(slug) { mutableStateOf<String?>(null) }
    var editDraft by remember(slug) { mutableStateOf("") }
    var pendingDelete by remember(slug) { mutableStateOf<PostCommentsResponseCommentsItem?>(null) }

    fun publish(list: List<PostCommentsResponseCommentsItem>, cursor: String?, count: Long) {
        comments = list
        nextCursor = cursor
        total = count
        onCountChanged(count)
    }

    composer.onPublished = { row, count ->
        comments = listOf(row.toRow()) + comments
        publish(comments, nextCursor, count)
    }
    composer.onFailed = { failed = true }

    LaunchedEffect(slug) {
        loading = true
        failed = false
        when (val answer = repository.comments(slug)) {
            is ApiResult.Success ->
                publish(answer.value.comments, answer.value.nextCursor, answer.value.total)
            is ApiResult.Failure -> failed = true
        }
        loading = false
    }

    Column(modifier = modifier.fillMaxWidth().padding(top = spacing.elementGap)) {
        HorizontalDivider(color = RoyColors.border.copy(alpha = 0.6f))

        Row(
            modifier = Modifier.padding(top = spacing.elementGapSm),
            horizontalArrangement = Arrangement.spacedBy(spacing.elementGapSm / 2),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(
                imageVector = LucideVectors.MessageCircle,
                contentDescription = null,
                tint = RoyColors.primary.copy(alpha = 0.8f),
                modifier = Modifier.size(18.dp),
            )
            Text(
                text = CommunityPostCopy.COMMENTS_TITLE,
                style = type.body.copy(fontWeight = FontWeight.Bold),
                color = RoyColors.foreground,
            )
            if (total > 0) {
                Text(
                    text = total.toString(),
                    style = type.xs.copy(fontWeight = FontWeight.Bold),
                    color = RoyColors.mutedForeground,
                )
            }
        }

        Spacer(Modifier.height(spacing.elementGapSm))

        Spacer(Modifier.height(spacing.elementGapSm))

        when {
            loading -> LoadingLine()
            failed && comments.isEmpty() ->
                Text(
                    text = CommunityPostCopy.COMMENT_FAILED,
                    style = type.xs,
                    color = RoyColors.mutedForeground,
                )
            comments.isEmpty() ->
                Column(modifier = Modifier.fillMaxWidth().padding(vertical = spacing.elementGapSm)) {
                    Text(
                        text = CommunityPostCopy.COMMENTS_EMPTY,
                        style = type.small.copy(fontWeight = FontWeight.Bold),
                        color = RoyColors.foreground,
                    )
                    Text(
                        text = CommunityPostCopy.COMMENTS_EMPTY_HINT,
                        style = type.xs,
                        color = RoyColors.mutedForeground,
                    )
                }
            else ->
                Column(verticalArrangement = Arrangement.spacedBy(spacing.elementGap)) {
                    comments.forEach { comment ->
                        CommentRow(
                            comment = comment,
                            mine = currentUserId != null && comment.author?.id == currentUserId,
                            editing = editingId == comment.id,
                            editDraft = editDraft,
                            onEditDraft = { editDraft = it },
                            onStartEdit = {
                                editingId = comment.id
                                editDraft = comment.body
                            },
                            onCancelEdit = { editingId = null },
                            onSaveEdit = {
                                val body = editDraft.trim()
                                if (body.isNotEmpty()) {
                                    scope.launch {
                                        when (val answer = repository.edit(comment.id, body)) {
                                            is ApiResult.Success ->
                                                comments =
                                                    comments.map {
                                                        if (it.id == comment.id) {
                                                            it.copy(
                                                                body = answer.value.comment.body,
                                                                editedAt = answer.value.comment.editedAt,
                                                            )
                                                        } else {
                                                            it
                                                        }
                                                    }
                                            is ApiResult.Failure -> failed = true
                                        }
                                        editingId = null
                                    }
                                }
                            },
                            onDelete = { pendingDelete = comment },
                        )
                    }
                }
        }

        nextCursor?.let { cursor ->
            Spacer(Modifier.height(spacing.elementGapSm))
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.Center) {
                Row(
                    modifier =
                        Modifier.clip(RoundedCornerShape(12.dp))
                            .clickable(enabled = !openingMore) {
                                scope.launch {
                                    openingMore = true
                                    when (val answer = repository.comments(slug, cursor)) {
                                        is ApiResult.Success ->
                                            publish(
                                                comments + answer.value.comments,
                                                answer.value.nextCursor,
                                                answer.value.total,
                                            )
                                        is ApiResult.Failure -> failed = true
                                    }
                                    openingMore = false
                                }
                            }
                            .padding(horizontal = spacing.elementGapSm, vertical = 10.dp),
                    horizontalArrangement = Arrangement.Center,
                ) {
                    Text(
                        text = CommunityPostCopy.COMMENTS_LOAD_MORE,
                        style = type.xs.copy(fontWeight = FontWeight.Bold),
                        color = RoyColors.primary,
                    )
                }
            }
        }

        pendingDelete?.let { target ->
            AlertDialog(
                onDismissRequest = { pendingDelete = null },
                title = { Text(CommunityPostCopy.COMMENT_DELETE_TITLE) },
                text = { Text(CommunityPostCopy.COMMENT_DELETE_BODY) },
                confirmButton = {
                    TextButton(
                        onClick = {
                            pendingDelete = null
                            scope.launch {
                                when (val answer = repository.delete(target.id)) {
                                    is ApiResult.Success -> {
                                        val kept = comments.filter { it.id != target.id }
                                        publish(kept, nextCursor, answer.value.commentCount)
                                    }
                                    is ApiResult.Failure -> failed = true
                                }
                            }
                        },
                    ) {
                        Text(CommunityPostCopy.COMMENT_DELETE)
                    }
                },
                dismissButton = {
                    TextButton(onClick = { pendingDelete = null }) {
                        Text(CommunityPostCopy.COMMENT_CANCEL)
                    }
                },
            )
        }
    }
}

/** One row: who, when, and what they said — or the field that changes it. */
@Composable
private fun CommentRow(
    comment: PostCommentsResponseCommentsItem,
    mine: Boolean,
    editing: Boolean,
    editDraft: String,
    onEditDraft: (String) -> Unit,
    onStartEdit: () -> Unit,
    onCancelEdit: () -> Unit,
    onSaveEdit: () -> Unit,
    onDelete: () -> Unit,
) {
    val type = LocalRoyTypeScale.current
    val spacing = LocalRoySpacing.current
    val author = comment.author
    var field by remember { mutableStateOf(TextFieldValue(editDraft, TextRange(editDraft.length))) }
    LaunchedEffect(editDraft) {
        if (field.text != editDraft) {
            field = TextFieldValue(editDraft, TextRange(editDraft.length))
        }
    }

    Row(horizontalArrangement = Arrangement.spacedBy(spacing.elementGapSm)) {
        if (!author?.avatar_url.isNullOrBlank()) {
            AsyncImage(
                model = author?.avatar_url,
                contentDescription = author?.name,
                contentScale = ContentScale.Crop,
                modifier = Modifier.size(28.dp).clip(CircleShape),
            )
        } else {
            Box(
                modifier =
                    Modifier.size(28.dp)
                        .clip(CircleShape)
                        .background(RoyColors.muted.copy(alpha = 0.6f)),
                contentAlignment = Alignment.Center,
            ) {
                Icon(
                    imageVector = LucideVectors.User,
                    contentDescription = null,
                    tint = RoyColors.mutedForeground,
                    modifier = Modifier.size(14.dp),
                )
            }
        }

        Column(Modifier.fillMaxWidth()) {
            Row(
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier.fillMaxWidth(),
            ) {
                Text(
                    text = author?.name?.takeIf { it.isNotBlank() } ?: "@${author?.username.orEmpty()}",
                    style = type.xs.copy(fontWeight = FontWeight.Bold),
                    color = RoyColors.foreground,
                )
                PostTime(
                    iso = comment.createdAt,
                    style = type.xs,
                    color = RoyColors.mutedForeground,
                )
                if (comment.editedAt != null) {
                    Text(
                        text = CommunityPostCopy.COMMENT_EDITED,
                        style = type.xs,
                        color = RoyColors.mutedForeground.copy(alpha = 0.7f),
                    )
                }
                if (mine && !editing) {
                    Spacer(Modifier.weight(1f))
                    IconAction(LucideVectors.PenLine, CommunityPostCopy.COMMENT_EDIT, onStartEdit)
                    IconAction(LucideVectors.Trash2, CommunityPostCopy.COMMENT_DELETE, onDelete)
                }
            }

            if (editing) {
                if (field.selection.length > 0) {
                    CommentFormatStrip(
                        onMark = { mark ->
                            field = toggleChatMark(field, mark)
                            onEditDraft(field.text)
                        },
                        onLink = {
                            field = insertChatLink(field)
                            onEditDraft(field.text)
                        },
                    )
                }
                OutlinedTextField(
                    value = field,
                    onValueChange = {
                        field = it
                        onEditDraft(it.text)
                    },
                    minLines = 2,
                    modifier = Modifier.fillMaxWidth().padding(top = 6.dp),
                )
                Row(
                    modifier = Modifier.fillMaxWidth().padding(top = 6.dp),
                    horizontalArrangement = Arrangement.spacedBy(8.dp, Alignment.End),
                ) {
                    TextButton(onClick = onCancelEdit) {
                        Text(CommunityPostCopy.COMMENT_CANCEL)
                    }
                    TextButton(onClick = onSaveEdit) {
                        Text(CommunityPostCopy.COMMENT_SUBMIT)
                    }
                }
            } else {
                Text(
                    // The same inline renderer the message bubble uses: the
                    // comment field writes the chat marks (ADR-0193).
                    text = remember(comment.body) { CommunityMarkdown.inline(comment.body) },
                    style = type.small,
                    color = RoyColors.foreground.copy(alpha = 0.9f),
                    modifier = Modifier.padding(top = 2.dp),
                )
            }
        }
    }
}

@Composable
private fun IconAction(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    label: String,
    onClick: () -> Unit,
) {
    Icon(
        imageVector = icon,
        contentDescription = label,
        tint = RoyColors.mutedForeground,
        modifier =
            Modifier.size(28.dp)
                .clip(RoundedCornerShape(8.dp))
                .clickable(onClick = onClick)
                .padding(5.dp)
                .semantics {
                    role = Role.Button
                    contentDescription = label
                },
    )
}

@Composable
private fun LoadingLine() {
    Row(
        modifier = Modifier.fillMaxWidth().padding(vertical = 10.dp),
        horizontalArrangement = Arrangement.Center,
    ) {
        Icon(
            imageVector = LucideVectors.Loader2,
            contentDescription = CommunityPostCopy.COMMENTS_TITLE,
            tint = RoyColors.mutedForeground,
            modifier = Modifier.size(18.dp),
        )
    }
}

/** The write's row, in the read's shape, so a new comment needs no second parse. */
private fun CreateCommentResponseComment.toRow() =
    PostCommentsResponseCommentsItem(
        id = id,
        postId = postId,
        body = body,
        author =
            author?.let {
                PostCommentsResponseCommentsItemAuthor(
                    id = it.id,
                    username = it.username,
                    name = it.name,
                    avatar_url = it.avatar_url,
                )
            },
        createdAt = createdAt,
        editedAt = editedAt,
    )
