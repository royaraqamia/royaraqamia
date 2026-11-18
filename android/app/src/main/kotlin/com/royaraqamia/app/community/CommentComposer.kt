package com.royaraqamia.app.community

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextRange
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.TextFieldValue
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.unit.dp
import com.royaraqamia.app.chats.ChatMark
import com.royaraqamia.app.chats.insertChatLink
import com.royaraqamia.app.chats.toggleChatMark
import com.royaraqamia.app.contracts.ApiResult
import com.royaraqamia.app.contracts.generated.CreateCommentResponseComment
import com.royaraqamia.app.theme.LocalRoySpacing
import com.royaraqamia.app.theme.LocalRoyTypeScale
import com.royaraqamia.app.theme.RoyColors
import com.royaraqamia.app.ui.vectors.LucideVectors
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.launch

/**
 * The draft and the send of the floating comment field, held above the thread
 * so the dock can sit over the scroll while the thread owns only the rows.
 */
internal class CommentComposerState(
    private val slug: String,
    private val repository: PostEngagementRepository?,
    private val signedIn: Boolean,
    private val onSignIn: () -> Unit,
) {
    var draft by mutableStateOf("")
        private set
    var sending by mutableStateOf(false)
        private set

    /** Set by the thread, so a send prepends its row and settles the count there. */
    var onPublished: (CreateCommentResponseComment, Long) -> Unit = { _, _ -> }
    var onFailed: () -> Unit = {}

    fun change(value: String) {
        draft = value
    }

    fun send(scope: CoroutineScope) {
        val body = draft.trim()
        if (body.isEmpty() || sending || repository == null) return
        if (!signedIn) {
            onSignIn()
            return
        }
        scope.launch {
            sending = true
            when (val answer = repository.comment(slug, body)) {
                is ApiResult.Success -> {
                    onPublished(answer.value.comment, answer.value.commentCount)
                    draft = ""
                }
                is ApiResult.Failure -> onFailed()

            }
            sending = false
        }
    }
}

@Composable
internal fun rememberCommentComposerState(
    slug: String,
    repository: PostEngagementRepository?,
    signedIn: Boolean,
    onSignIn: () -> Unit,
): CommentComposerState =
    remember(slug, repository, signedIn, onSignIn) {
        CommentComposerState(slug, repository, signedIn, onSignIn)
    }

/**
 * The comment field the member sees all the way down the post: the chat row's
 * shape — one field and a send button — without the paperclip or the microphone.
 * The marks are the chat marks, in the post's own words (ADR-0193).
 */
@Composable
internal fun PostCommentDock(
    state: CommentComposerState,
    onSend: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val spacing = LocalRoySpacing.current
    val type = LocalRoyTypeScale.current
    var field by remember {
        mutableStateOf(TextFieldValue(state.draft, TextRange(state.draft.length)))
    }
    LaunchedEffect(state.draft) {
        if (field.text != state.draft) {
            field = TextFieldValue(state.draft, TextRange(state.draft.length))
        }
    }

    Row(
        modifier =
            modifier
                .fillMaxWidth()
                .background(RoyColors.background)
                .padding(horizontal = spacing.containerPadding, vertical = spacing.elementGapSm),
        verticalAlignment = Alignment.Bottom,
    ) {
        Column(modifier = Modifier.weight(1f)) {
            if (field.selection.length > 0) {
                CommentFormatStrip(
                    onMark = { mark ->
                        field = toggleChatMark(field, mark)
                        state.change(field.text)
                    },
                    onLink = {
                        field = insertChatLink(field)
                        state.change(field.text)
                    },
                )
            }
            OutlinedTextField(
                value = field,
                onValueChange = {
                    field = it
                    state.change(it.text)
                },
                placeholder = {
                    Text(text = CommunityPostCopy.COMMENT_PLACEHOLDER, style = type.small)
                },
                singleLine = false,
                maxLines = 5,
                enabled = !state.sending,
                modifier =
                    Modifier.fillMaxWidth()
                        .heightIn(min = 44.dp, max = 128.dp)
                        .testTag(CommunityPostMetrics.COMMENT_FIELD)
                        .semantics { contentDescription = CommunityPostCopy.COMMENT_PLACEHOLDER },
            )
        }
        IconButton(
            onClick = onSend,
            enabled = state.draft.isNotBlank() && !state.sending,
            modifier =
                Modifier.size(44.dp)
                    .background(RoyColors.primary, CircleShape),
        ) {
            Icon(
                imageVector = LucideVectors.Send,
                contentDescription = CommunityPostCopy.COMMENT_SUBMIT_LABEL,
                tint = RoyColors.primaryForeground,
                modifier = Modifier.size(16.dp),
            )
        }
    }
}

/** The six marks, worded by the post's own copy, offered while text is selected. */
@Composable
internal fun CommentFormatStrip(onMark: (ChatMark) -> Unit, onLink: () -> Unit) {
    Row(
        horizontalArrangement = Arrangement.spacedBy(4.dp),
        verticalAlignment = Alignment.CenterVertically,
        modifier = Modifier.fillMaxWidth().padding(bottom = 4.dp),
    ) {
        MarkAction("B", CommunityPostCopy.FORMAT_BOLD) { onMark(ChatMark.Bold) }
        MarkAction("I", CommunityPostCopy.FORMAT_ITALIC, italic = true) { onMark(ChatMark.Italic) }
        MarkAction("U", CommunityPostCopy.FORMAT_UNDERLINE, underline = true) {
            onMark(ChatMark.Underline)
        }
        MarkAction("S", CommunityPostCopy.FORMAT_STRIKE, strike = true) { onMark(ChatMark.Strike) }
        MarkAction("<>", CommunityPostCopy.FORMAT_CODE) { onMark(ChatMark.Code) }
        MarkAction(LucideVectors.Link2, CommunityPostCopy.FORMAT_LINK, onLink)
    }
}

@Composable
private fun MarkAction(
    glyph: String,
    description: String,
    italic: Boolean = false,
    underline: Boolean = false,
    strike: Boolean = false,
    onClick: () -> Unit,
) {
    TextButton(
        onClick = onClick,
        contentPadding = PaddingValues(horizontal = 8.dp),
        modifier = Modifier.semantics { contentDescription = description },
    ) {
        Text(
            text = glyph,
            style =
                LocalRoyTypeScale.current.xs.copy(
                    fontWeight = FontWeight.Bold,
                    fontStyle = if (italic) FontStyle.Italic else FontStyle.Normal,
                    textDecoration =
                        when {
                            underline -> TextDecoration.Underline
                            strike -> TextDecoration.LineThrough
                            else -> TextDecoration.None
                        },
                ),
            color = RoyColors.mutedForeground,
        )
    }
}

/** The link's own control: the one mark the site draws as an icon. */
@Composable
private fun MarkAction(
    icon: ImageVector,
    description: String,
    onClick: () -> Unit,
) {
    TextButton(
        onClick = onClick,
        contentPadding = PaddingValues(horizontal = 8.dp),
        modifier = Modifier.semantics { contentDescription = description },
    ) {
        Icon(
            imageVector = icon,
            contentDescription = null,
            tint = RoyColors.mutedForeground,
            modifier = Modifier.size(16.dp),
        )
    }
}
