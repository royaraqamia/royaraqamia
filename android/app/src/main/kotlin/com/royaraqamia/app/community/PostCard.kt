package com.royaraqamia.app.community

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import coil.compose.AsyncImage
import com.royaraqamia.app.contracts.generated.CommunityIndexResponsePostsItem
import com.royaraqamia.app.contracts.generated.PostEngagementBatchItemsItem
import com.royaraqamia.app.theme.LocalRoySpacing
import com.royaraqamia.app.theme.LocalRoyTypeScale
import com.royaraqamia.app.theme.Recipes
import com.royaraqamia.app.theme.RoyColors
import com.royaraqamia.app.ui.vectors.LucideVectors

/**
 * One row of the community feed (#658), the app's half of
 * `app/community/_components/post-card.tsx`.
 *
 * The card is the feed's cell and, later in this ticket, the account's and a
 * member's profile: the same cover, the same publisher chip, the same clamped
 * body, the same footer. What it prints is derived, never retyped — the body and
 * the label come from [PostText] (the site's `stripMarkdown`/`postExcerpt`), the
 * age from [PostTime] (the site's relative sentence), and every word from
 * the generated [PostCardCopy].
 *
 * A post has no title (the product is a social feed, not a blog), so the body is
 * the card's text: four lines and a toggle, or the whole body and the way back.
 * The toggle is drawn only when the text overflows, which is measured rather
 * than guessed.
 *
 * The footer is a band on the card's own surface, not a row under a rule (#1573):
 * the page draws no separators at all, and the band's tone is what says the
 * footer starts. Inside it sit the two facts (age, views) and the three actions
 * (like, comment, share) — one control shape, told apart by behaviour rather than
 * by being rounder than its neighbour.
 *
 * Tapping the card opens the post; tapping the publisher opens their profile.
 */
@Composable
fun PostCard(
    post: CommunityIndexResponsePostsItem,
    modifier: Modifier = Modifier,
    onOpen: () -> Unit = {},
    onOpenAuthor: (String) -> Unit = {},
    onEdit: (() -> Unit)? = null,
    postActions: PostActionHandler? = null,
    engagement: PostEngagementBatchItemsItem? = null,
    onToggleLike: (() -> Unit)? = null,
    onOpenComments: (() -> Unit)? = null,
    onShare: (() -> Unit)? = null,
    currentUserId: String? = null,
) {
    val type = LocalRoyTypeScale.current
    val spacing = LocalRoySpacing.current

    var state by remember(post.id) { mutableStateOf<PostCardState>(PostCardState.Collapsed) }
    var overflows by remember(post.id) { mutableStateOf(false) }

    val body =
        if (!post.content.isNullOrBlank()) {
            PostText.stripMarkdown(post.content)
        } else {
            post.meta_desc.orEmpty()
        }
    val label = PostText.label(post.content, post.meta_desc)

    Surface(
        modifier =
            modifier
                .fillMaxWidth()
                .testTag(CommunityFeedMetrics.CARD)
                .clickable(onClick = onOpen),
        shape = CARD_SHAPE,
        color = RoyColors.muted.copy(alpha = 0.2f),
        border = BorderStroke(1.dp, RoyColors.border.copy(alpha = 0.6f)),
    ) {
        Column(Modifier.fillMaxWidth()) {
            post.cover_image?.takeIf { it.isNotBlank() }?.let { cover ->
                AsyncImage(
                    model = cover,
                    contentDescription = label,
                    contentScale = ContentScale.Crop,
                    modifier =
                        Modifier.fillMaxWidth()
                            .aspectRatio(16f / 10f)
                            .background(RoyColors.muted.copy(alpha = 0.8f)),
                )
            }

            Column(
                modifier =
                    Modifier.padding(Recipes.Card.padding(spacing))
                        .testTag(CommunityFeedMetrics.CARD_CONTENT),
                verticalArrangement = Arrangement.spacedBy(spacing.elementGapSm),
            ) {
                val author = post.author
                if (author?.name != null) {
                    Row(
                        modifier =
                            Modifier.fillMaxWidth()
                                .clip(CircleShape)
                                .clickable { onOpenAuthor(author.username) }
                                .padding(vertical = 2.dp)
                                .semantics {
                                    contentDescription =
                                        PostCardCopy.AUTHOR_LINK.replace("{name}", author.name ?: "")
                                },
                        horizontalArrangement = Arrangement.spacedBy(spacing.elementGapSm),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        if (!author.avatar_url.isNullOrBlank()) {
                            AsyncImage(
                                model = author.avatar_url,
                                contentDescription = author.name,
                                contentScale = ContentScale.Crop,
                                modifier = Modifier.size(28.dp).clip(CircleShape),
                            )
                        } else {
                            Box(
                                modifier =
                                    Modifier.size(28.dp)
                                        .clip(CircleShape)
                                        .background(RoyColors.primary.copy(alpha = 0.15f)),
                                contentAlignment = Alignment.Center,
                            ) {
                                Icon(
                                    imageVector = LucideVectors.User,
                                    contentDescription = null,
                                    tint = RoyColors.primary,
                                    modifier = Modifier.size(14.dp),
                                )
                            }
                        }
                        Column(Modifier.fillMaxWidth()) {
                            Text(
                                text = author.name,
                                style = type.xs.copy(fontWeight = FontWeight.Bold),
                                color = RoyColors.foreground,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                            )
                            Text(
                                text = "@${author.username}",
                                style = type.xs,
                                color = RoyColors.mutedForeground,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                            )
                        }
                    }
                }

                if (body.isNotEmpty()) {
                    Text(
                        text = body,
                        style = type.small,
                        color = RoyColors.mutedForeground,
                        maxLines =
                            when (state) {
                                PostCardState.Collapsed -> 4
                                PostCardState.Expanded -> Int.MAX_VALUE
                            },
                        overflow = TextOverflow.Ellipsis,
                        onTextLayout = { result ->
                            if (state == PostCardState.Collapsed && result.hasVisualOverflow) {
                                overflows = true
                            }
                        },
                    )

                    if (overflows) {
                        val expanded = state == PostCardState.Expanded
                        Text(
                            text =
                                if (expanded) {
                                    PostCardCopy.COLLAPSE
                                } else {
                                    PostCardCopy.EXPAND
                                },
                            style = type.xs.copy(fontWeight = FontWeight.Bold),
                            color = RoyColors.primary,
                            modifier =
                                Modifier.clickable {
                                    state =
                                        if (expanded) {
                                            PostCardState.Collapsed
                                        } else {
                                            PostCardState.Expanded
                                        }
                                },
                        )
                    }
                }
            }

            CardFooter(
                post = post,
                engagement = engagement,
                onToggleLike = onToggleLike,
                onOpenComments = onOpenComments,
                onShare = onShare,
                onEdit = onEdit,
                postActions = postActions,
                currentUserId = currentUserId,
            )
        }
    }
}

/**
 * The band at the bottom of the card (#1573).
 *
 * Full-bleed by construction — it is a sibling of the padded content column, not
 * a row inside it — so its tone runs to the card's own rounded edge. The facts sit
 * above the actions, and zero draws nothing, the rule [PostViews] already keeps.
 */
@Composable
private fun CardFooter(
    post: CommunityIndexResponsePostsItem,
    engagement: PostEngagementBatchItemsItem?,
    onToggleLike: (() -> Unit)?,
    onOpenComments: (() -> Unit)?,
    onShare: (() -> Unit)?,
    onEdit: (() -> Unit)?,
    postActions: PostActionHandler?,
    currentUserId: String?,
) {
    val type = LocalRoyTypeScale.current
    val spacing = LocalRoySpacing.current

    Column(
        modifier =
            Modifier.fillMaxWidth()
                .background(RoyColors.muted.copy(alpha = 0.2f))
                .padding(horizontal = Recipes.Card.padding(spacing), vertical = 10.dp),
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(spacing.elementGapSm / 2),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            post.published_at?.let { published ->
                PostTime(
                    iso = published,
                    style = type.xs.copy(fontWeight = FontWeight.Medium),
                    color = RoyColors.mutedForeground,
                )
            }
            if (post.view_count > 0) {
                Icon(
                    imageVector = LucideVectors.Eye,
                    contentDescription = null,
                    tint = RoyColors.mutedForeground.copy(alpha = 0.8f),
                    modifier = Modifier.size(14.dp),
                )
                Text(
                    text = post.view_count.toString(),
                    style = type.xs,
                    color = RoyColors.mutedForeground,
                )
            }
        }

        Row(
            modifier = Modifier.fillMaxWidth().padding(top = 2.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Row(horizontalArrangement = Arrangement.spacedBy(2.dp)) {
                CardAction(
                    icon = LucideVectors.Heart,
                    label =
                        if (engagement?.liked == true) {
                            PostCardCopy.UNLIKE_ACTION
                        } else {
                            PostCardCopy.LIKE_ACTION
                        },
                    count = engagement?.likeCount,
                    active = engagement?.liked == true,
                    onClick = onToggleLike,
                )
                CardAction(
                    icon = LucideVectors.MessageCircle,
                    label = PostCardCopy.COMMENT_ACTION,
                    count = engagement?.commentCount,
                    active = false,
                    onClick = onOpenComments,
                )
            }

            Row(horizontalArrangement = Arrangement.spacedBy(2.dp)) {
                CardAction(
                    icon = LucideVectors.Share2,
                    label = PostCardCopy.SHARE_ACTION,
                    count = null,
                    active = false,
                    onClick = onShare,
                )
                if (postActions != null) {
                    PostActionsMenu(
                        target = post.asPostActionTarget(),
                        currentUserId = currentUserId,
                        handler =
                            postActions.copy(
                                edit =
                                    onEdit?.let { callback ->
                                        { _: PostActionTarget -> callback() }
                                    } ?: postActions.edit
                            ),
                    )
                }
            }
        }
    }
}

/** One control in the footer: the same box for every action, emphasis aside. */
@Composable
private fun CardAction(
    icon: ImageVector,
    label: String,
    count: Long?,
    active: Boolean,
    onClick: (() -> Unit)?,
) {
    val type = LocalRoyTypeScale.current
    val tint = if (active) RoyColors.primary else RoyColors.mutedForeground

    Row(
        modifier =
            Modifier.clip(RoundedCornerShape(12.dp))
                .then(if (onClick != null) Modifier.clickable(onClick = onClick) else Modifier)
                .padding(horizontal = 8.dp, vertical = 7.dp)
                .semantics {
                    role = Role.Button
                    contentDescription = label
                },
        horizontalArrangement = Arrangement.spacedBy(6.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(
            imageVector = icon,
            contentDescription = null,
            tint = tint,
            modifier = Modifier.size(18.dp),
        )
        if (count != null && count > 0) {
            Text(
                text = count.toString(),
                style = type.xs.copy(fontWeight = FontWeight.Bold),
                color = tint,
            )
        }
    }
}

/** The site's `rounded-3xl`: one step larger than the account card's shape. */
private val CARD_SHAPE = RoundedCornerShape(CommunityFeedMetrics.CARD_RADIUS.dp)
