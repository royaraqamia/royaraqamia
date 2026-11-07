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
import androidx.compose.material3.Divider
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
import com.royaraqamia.app.plans.PlanDates
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
 * body, the same date. What it prints is derived, never retyped — the body and
 * the label come from [PostText] (the site's `stripMarkdown`/`postExcerpt`), the
 * date from [PlanDates] (the site's Umm al-Qura sentence), and every word from
 * the generated [PostCardCopy].
 *
 * A post has no title (the product is a social feed, not a blog), so the body is
 * the card's text: four lines and a toggle, or the whole body and the way back.
 * The toggle is drawn only when the text overflows, which is measured rather
 * than guessed — `onTextLayout` says so, and the answer is latched so expanding
 * the text cannot make the "show less" control disappear.
 *
 * Tapping the card opens the post; tapping the publisher opens their profile.
 * Both are the shell's routes (`/community/<slug>`, `/u/<username>`), so a card
 * says where it goes without knowing who draws the destination.
 */
@Composable
fun PostCard(
    post: CommunityIndexResponsePostsItem,
    modifier: Modifier = Modifier,
    onOpen: () -> Unit = {},
    onOpenAuthor: (String) -> Unit = {},
    onEdit: (() -> Unit)? = null,
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

                Divider(
                    color = RoyColors.border.copy(alpha = 0.6f),
                    thickness = 1.dp,
                    modifier = Modifier.padding(top = spacing.elementGapSm / 2),
                )

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(spacing.elementGapSm / 2),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Icon(
                        imageVector = LucideVectors.Calendar,
                        contentDescription = null,
                        tint = RoyColors.mutedForeground,
                        modifier = Modifier.size(14.dp),
                    )
                    post.published_at?.let { published ->
                        Text(
                            text = PlanDates.label(published),
                            style = type.xs.copy(fontWeight = FontWeight.Medium),
                            color = RoyColors.mutedForeground,
                        )
                    }
                    // The owner's way into the editor (#925). The page draws it
                    // as the first item of its actions menu; the app names the
                    // one action this slice ports.
                    if (onEdit != null) {
                        Spacer(Modifier.weight(1f))
                        Row(
                            modifier =
                                Modifier.clip(CircleShape)
                                    .clickable(onClick = onEdit)
                                    .padding(horizontal = 6.dp, vertical = 2.dp)
                                    .semantics {
                                        role = Role.Button
                                        contentDescription = PostCardCopy.EDIT_ACTION
                                    },
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(4.dp),
                        ) {
                            Icon(
                                imageVector = LucideVectors.PenLine,
                                contentDescription = null,
                                tint = RoyColors.primary,
                                modifier = Modifier.size(14.dp),
                            )
                            Text(
                                text = PostCardCopy.EDIT_ACTION,
                                style = type.xs.copy(fontWeight = FontWeight.Bold),
                                color = RoyColors.primary,
                            )
                        }
                    }
                }
            }
        }
    }
}

/** The site's `rounded-3xl`: one step larger than the account card's shape. */
private val CARD_SHAPE = RoundedCornerShape(CommunityFeedMetrics.CARD_RADIUS.dp)
