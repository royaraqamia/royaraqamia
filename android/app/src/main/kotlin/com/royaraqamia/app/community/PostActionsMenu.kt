package com.royaraqamia.app.community

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.royaraqamia.app.contracts.generated.CommunityIndexResponsePostsItem
import com.royaraqamia.app.contracts.generated.CommunityIndexResponsePostsItemStatus
import com.royaraqamia.app.contracts.generated.CommunityPostResponsePost
import com.royaraqamia.app.contracts.generated.CommunityPostResponsePostStatus
import com.royaraqamia.app.theme.LocalRoyTypeScale
import com.royaraqamia.app.theme.RoyColors
import com.royaraqamia.app.ui.vectors.LucideVectors
import kotlinx.coroutines.launch

/**
 * The owner's actions on one post, the app's half of
 * `app/community/_components/post-actions-menu.tsx` (ADR-0098).
 *
 * The web menu is the reference: edit, a publish/unpublish toggle, a pin toggle,
 * Markdown export and a destructive delete behind a confirmation. The delete
 * owns its dialog here; what happens after it - hiding the card, the undo, the
 * repaint - belongs to the host, which hands it back through [PostActionHandler].
 * The words are the generated [PostCardCopy]; none is retyped into Kotlin.
 */
enum class PostActionStatus {
    DRAFT,
    PUBLISHED,
    SCHEDULED,
}

/** The fields the owner's menu needs, shared by a feed card and a post page. */
data class PostActionTarget(
    val id: String,
    val authorId: String,
    val slug: String,
    val content: String?,
    val metaTitle: String?,
    val status: PostActionStatus,
    val featured: Boolean,
)

/**
 * What the host does when an item is pressed. Every callback is optional: a
 * feed card without an owner, or the test overload of a screen, hands an empty
 * handler and the menu draws nothing.
 */
data class PostActionHandler(
    val edit: ((PostActionTarget) -> Unit)? = null,
    val publish: (suspend (PostActionTarget, Boolean) -> Boolean)? = null,
    val featured: (suspend (PostActionTarget, Boolean) -> Boolean)? = null,
    val exportMarkdown: ((PostActionTarget) -> Unit)? = null,
    val delete: (suspend (PostActionTarget) -> Boolean)? = null,
    val restore: (suspend (PostActionTarget) -> Boolean)? = null,
) {
    val hasActions: Boolean
        get() =
            edit != null ||
                publish != null ||
                featured != null ||
                exportMarkdown != null ||
                delete != null
}

/** The feed's row as the menu's target. */
fun CommunityIndexResponsePostsItem.asPostActionTarget(): PostActionTarget =
    PostActionTarget(
        id = id,
        authorId = author_id,
        slug = slug,
        content = content,
        metaTitle = meta_title,
        status =
            when (status) {
                CommunityIndexResponsePostsItemStatus.DRAFT -> PostActionStatus.DRAFT
                CommunityIndexResponsePostsItemStatus.PUBLISHED -> PostActionStatus.PUBLISHED
                CommunityIndexResponsePostsItemStatus.SCHEDULED -> PostActionStatus.SCHEDULED
            },
        featured = featured,
    )

/** The post page's row as the menu's target. */
fun CommunityPostResponsePost.asPostActionTarget(): PostActionTarget =
    PostActionTarget(
        id = id,
        authorId = author_id,
        slug = slug,
        content = content,
        metaTitle = meta_title,
        status =
            when (status) {
                CommunityPostResponsePostStatus.DRAFT -> PostActionStatus.DRAFT
                CommunityPostResponsePostStatus.PUBLISHED -> PostActionStatus.PUBLISHED
                CommunityPostResponsePostStatus.SCHEDULED -> PostActionStatus.SCHEDULED
            },
        featured = featured,
    )

/** The overflow trigger, drawn only for the owner and only when there is an action. */
@Composable
fun PostActionsMenu(
    target: PostActionTarget,
    handler: PostActionHandler,
    modifier: Modifier = Modifier,
    currentUserId: String? = null,
) {
    // The web menu returns null for a guest or a non-owner; so does this one.
    // A null id is "no viewer", not "everyone", so a card drawn without one
    // (the profile) never leaks the owner's actions.
    if (currentUserId != null && currentUserId == target.authorId && handler.hasActions) {
        PostActionsMenuContent(target = target, handler = handler, modifier = modifier)
    }
}

@Composable
private fun PostActionsMenuContent(
    target: PostActionTarget,
    handler: PostActionHandler,
    modifier: Modifier,
) {
    var menuOpen by remember { mutableStateOf(false) }
    var confirmOpen by remember { mutableStateOf(false) }
    var busy by remember { mutableStateOf(false) }
    var published by remember(target.id) {
        mutableStateOf(target.status == PostActionStatus.PUBLISHED)
    }
    var featured by remember(target.id) { mutableStateOf(target.featured) }
    val scope = rememberCoroutineScope()
    val type = LocalRoyTypeScale.current

    Box(modifier = modifier.testTag(PostActionMetrics.MENU)) {
        Box(
            modifier =
                Modifier.size(36.dp)
                    .clip(RoundedCornerShape(12.dp))
                    .clickable(enabled = !busy) { menuOpen = true }
                    .semantics {
                        role = Role.Button
                        contentDescription = PostCardCopy.MORE_ACTION
                    },
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                imageVector = if (busy) LucideVectors.Loader2 else LucideVectors.Ellipsis,
                contentDescription = null,
                tint = RoyColors.mutedForeground,
                modifier = Modifier.size(18.dp),
            )
        }

        DropdownMenu(expanded = menuOpen, onDismissRequest = { menuOpen = false }) {
            handler.edit?.let { onEdit ->
                PostActionItem(
                    tag = PostActionMetrics.EDIT,
                    icon = LucideVectors.PenLine,
                    label = PostCardCopy.EDIT_ACTION,
                ) {
                    menuOpen = false
                    onEdit(target)
                }
            }
            handler.publish?.let { onPublish ->
                PostActionItem(
                    tag = PostActionMetrics.PUBLISH,
                    icon = if (published) LucideVectors.EyeOff else LucideVectors.Eye,
                    label =
                        if (published) {
                            PostCardCopy.UNPUBLISH_ACTION
                        } else if (target.status == PostActionStatus.SCHEDULED) {
                            PostCardCopy.PUBLISH_NOW_ACTION
                        } else {
                            PostCardCopy.PUBLISH_ACTION
                        },
                ) {
                    menuOpen = false
                    scope.launch {
                        busy = true
                        val next = !published
                        if (onPublish(target, next)) published = next
                        busy = false
                    }
                }
            }
            handler.featured?.let { onFeatured ->
                PostActionItem(
                    tag = PostActionMetrics.FEATURED,
                    icon = LucideVectors.Flag,
                    label =
                        if (featured) {
                            PostCardCopy.UNPIN_ACTION
                        } else {
                            PostCardCopy.PIN_ACTION
                        },
                ) {
                    menuOpen = false
                    scope.launch {
                        busy = true
                        val next = !featured
                        if (onFeatured(target, next)) featured = next
                        busy = false
                    }
                }
            }
            handler.exportMarkdown?.let { onExport ->
                PostActionItem(
                    tag = PostActionMetrics.EXPORT,
                    icon = LucideVectors.FileText,
                    label = PostCardCopy.EXPORT_MARKDOWN_ACTION,
                ) {
                    menuOpen = false
                    onExport(target)
                }
            }
            if (handler.delete != null) {
                HorizontalDivider(color = RoyColors.border.copy(alpha = 0.5f))
                PostActionItem(
                    tag = PostActionMetrics.DELETE,
                    icon = LucideVectors.Trash2,
                    label = PostCardCopy.DELETE_ACTION,
                    destructive = true,
                ) {
                    menuOpen = false
                    confirmOpen = true
                }
            }
        }
    }

    if (confirmOpen) {
        AlertDialog(
            onDismissRequest = { confirmOpen = false },
            icon = {
                Icon(
                    imageVector = LucideVectors.Trash2,
                    contentDescription = null,
                    tint = RoyColors.destructive,
                    modifier = Modifier.size(20.dp),
                )
            },
            title = {
                Text(
                    text = PostCardCopy.DELETE_TITLE,
                    style = type.small.copy(fontWeight = FontWeight.Bold),
                )
            },
            text = {
                val title =
                    target.metaTitle?.takeIf { it.isNotBlank() }
                        ?: PostText.excerpt(target.content).ifBlank { target.slug }
                Text(
                    text = PostCardCopy.DELETE_MESSAGE.replace("{title}", title),
                    style = type.small,
                    color = RoyColors.mutedForeground,
                )
            },
            confirmButton = {
                TextButton(
                    onClick = {
                        confirmOpen = false
                        scope.launch {
                            busy = true
                            handler.delete?.invoke(target)
                            busy = false
                        }
                    },
                    modifier = Modifier.testTag(PostActionMetrics.DELETE_CONFIRM),
                ) {
                    Text(text = PostCardCopy.DELETE_ACTION, color = RoyColors.destructive)
                }
            },
            dismissButton = {
                TextButton(onClick = { confirmOpen = false }) {
                    Text(text = CommunityEditorCopy.CANCEL)
                }
            },
            containerColor = RoyColors.card,
        )
    }
}

@Composable
private fun PostActionItem(
    tag: String,
    icon: ImageVector,
    label: String,
    destructive: Boolean = false,
    onClick: () -> Unit,
) {
    val type = LocalRoyTypeScale.current
    val tint = if (destructive) RoyColors.destructive else RoyColors.foreground
    DropdownMenuItem(
        modifier = Modifier.testTag(tag),
        text = { Text(text = label, style = type.small, color = tint) },
        leadingIcon = {
            Icon(
                imageVector = icon,
                contentDescription = null,
                tint = if (destructive) RoyColors.destructive else RoyColors.mutedForeground,
                modifier = Modifier.size(16.dp),
            )
        },
        onClick = onClick,
    )
}

/** The toolbar's test tags, named once for a future interaction test. */
internal object PostActionMetrics {
    const val MENU = "post-actions-menu"
    const val EDIT = "post-actions-edit"
    const val PUBLISH = "post-actions-publish"
    const val FEATURED = "post-actions-featured"
    const val EXPORT = "post-actions-export"
    const val DELETE = "post-actions-delete"
    const val DELETE_CONFIRM = "post-actions-delete-confirm"
}
