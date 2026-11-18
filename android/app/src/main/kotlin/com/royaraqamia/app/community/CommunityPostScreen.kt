package com.royaraqamia.app.community

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Icon
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
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.PlatformTextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import com.royaraqamia.app.contracts.ApiError
import com.royaraqamia.app.contracts.ApiResult
import com.royaraqamia.app.contracts.generated.CommunityPostResponse
import com.royaraqamia.app.contracts.generated.CommunityPostResponsePostAuthor
import com.royaraqamia.app.contracts.generated.PostEngagementBatchItemsItem
import com.royaraqamia.app.plans.PlanDates
import com.royaraqamia.app.shared.NeedsConnection
import com.royaraqamia.app.shared.NeedsConnectionState
import com.royaraqamia.app.shared.ReadFailureNotice
import com.royaraqamia.app.shared.ReadFailureState
import com.royaraqamia.app.theme.LocalRoySpacing
import com.royaraqamia.app.theme.LocalRoyTypeScale
import com.royaraqamia.app.theme.RoyColors
import com.royaraqamia.app.ui.vectors.LucideVectors
import kotlinx.coroutines.launch

/**
 * The visual gate's handles on one post (#922, `shared/visual/community-post.json`).
 *
 * The page's own boxes are named here so a later recording can compare them:
 * the post column, the publisher chip, the cover, the tags and the body.
 */
object CommunityPostMetrics {
    const val POST = "community-post"
    const val COVER = "community-post-cover"
    const val AUTHOR = "community-post-author"
    const val TAGS = "community-post-tags"
    const val BODY = "community-post-body"
    const val COMMENT_FIELD = "community-comment-field"

    /** The page's `rounded-2xl` at the phone width (`sm:` is 640px). */
    const val COVER_RADIUS = 16
}

/**
 * `/community/[slug]` as a screen (#922), with the post's engagement (#1573).
 *
 * The page draws one published post: the publisher chip and its facts, the cover,
 * the tags, the Markdown body, then the actions and the thread. The app draws the
 * same parts from the same routes and the same words ([CommunityPostCopy],
 * [PostCardCopy]), with the body converted by [CommunityMarkdown] because the app
 * has no Markdown runtime.
 *
 * The two faces the server decides are [CommunityPostUiState.AtRest] and
 * [CommunityPostUiState.NotFound]; a read that never answered is the shared
 * read-failure or needs-connection notice, kept apart for the reason ADR-0031
 * gives.
 */
@Composable
fun CommunityPostScreen(
    slug: String,
    repository: CommunityPostRepository,
    engagementRepository: PostEngagementRepository,
    modifier: Modifier = Modifier,
    onOpenProfile: (String) -> Unit = {},
    onSharePost: () -> Unit = {},
    onSignIn: () -> Unit = {},
    signedIn: Boolean = false,
    currentUserId: String? = null,
    postActions: PostActionHandler? = null,
) {
    var state by remember(slug) { mutableStateOf<CommunityPostUiState?>(null) }
    var failure by remember(slug) { mutableStateOf<ApiError?>(null) }
    var engagement by remember(slug) { mutableStateOf<PostEngagementBatchItemsItem?>(null) }
    var attempts by remember(slug) { mutableStateOf(0) }
    val scope = rememberCoroutineScope()

    LaunchedEffect(slug, attempts) {
        state = null
        failure = null
        engagement = null

        val result = repository.post(slug)
        state = CommunityPostUiState.of(result, slug)
        failure = (result as? CommunityPostResult.Unavailable)?.error

        val live = (state as? CommunityPostUiState.AtRest)?.post
        if (live != null) {
            when (val answer = engagementRepository.states(listOf(live.post.id))) {
                is ApiResult.Success -> engagement = answer.value.items.firstOrNull()
                is ApiResult.Failure -> Unit
            }
        }
    }

    val toggleLike: () -> Unit = {
        val current = engagement
        if (!signedIn) {
            onSignIn()
        } else {
            val next = current?.liked != true
            // Paint first, then settle on the server's number (#1573): the press
            // must not wait for a round trip to feel answered.
            engagement =
                current?.copy(
                    liked = next,
                    likeCount = maxOf(0, current.likeCount + if (next) 1 else -1),
                )
            scope.launch {
                when (val answer = engagementRepository.like(slug, next)) {
                    is ApiResult.Success ->
                        engagement =
                            engagement?.copy(
                                liked = answer.value.liked,
                                likeCount = answer.value.likeCount,
                            )
                    is ApiResult.Failure -> engagement = current
                }
            }
        }
    }

    CommunityPostContent(
        state = state,
        failure = failure,
        engagement = engagement,
        slug = slug,
        engagementRepository = engagementRepository,
        signedIn = signedIn,
        currentUserId = currentUserId,
        onToggleLike = toggleLike,
        onSharePost = onSharePost,
        onSignIn = onSignIn,
        onCountChanged = { count -> engagement = engagement?.copy(commentCount = count) },
        onRetry = { attempts += 1 },
        onOpenProfile = onOpenProfile,
        postActions = postActions,
        modifier = modifier,
    )
}

/** The screen over a state the caller already decided, so a test can draw each face. */
@Composable
internal fun CommunityPostScreen(
    state: CommunityPostUiState?,
    failure: ApiError?,
    onRetry: () -> Unit,
    onOpenProfile: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    CommunityPostContent(
        state = state,
        failure = failure,
        engagement = null,
        slug = "",
        engagementRepository = null,
        signedIn = false,
        currentUserId = null,
        onToggleLike = {},
        onSharePost = {},
        onSignIn = {},
        onCountChanged = {},
        onRetry = onRetry,
        onOpenProfile = onOpenProfile,
        postActions = null,
        modifier = modifier,
    )
}

@Composable
private fun CommunityPostContent(
    state: CommunityPostUiState?,
    failure: ApiError?,
    engagement: PostEngagementBatchItemsItem?,
    slug: String,
    engagementRepository: PostEngagementRepository?,
    signedIn: Boolean,
    currentUserId: String?,
    onToggleLike: () -> Unit,
    onSharePost: () -> Unit,
    onSignIn: () -> Unit,
    onCountChanged: (Long) -> Unit,
    onRetry: () -> Unit,
    onOpenProfile: (String) -> Unit,
    postActions: PostActionHandler?,
    modifier: Modifier = Modifier,
) {
    val spacing = LocalRoySpacing.current

    Box(modifier = modifier.fillMaxSize()) {
        when {
            failure != null ->
                Unavailable(offline = failure is ApiError.Network, onRetry = onRetry)

            state == null -> PostSkeleton()

            state is CommunityPostUiState.NotFound -> NotFound()

            state is CommunityPostUiState.AtRest ->
                Post(
                    response = state.post,
                    engagement = engagement,
                    slug = slug,
                    engagementRepository = engagementRepository,
                    signedIn = signedIn,
                    currentUserId = currentUserId,
                    onToggleLike = onToggleLike,
                    onSharePost = onSharePost,
                    onSignIn = onSignIn,
                    onCountChanged = onCountChanged,
                    onOpenProfile = onOpenProfile,
                    postActions = postActions,
                    modifier = Modifier.padding(horizontal = spacing.containerPadding),
                )
        }
    }
}

/** The post the server answered, in the page's reading order. */
@Composable
private fun Post(
    response: CommunityPostResponse,
    engagement: PostEngagementBatchItemsItem?,
    slug: String,
    engagementRepository: PostEngagementRepository?,
    signedIn: Boolean,
    currentUserId: String?,
    onToggleLike: () -> Unit,
    onSharePost: () -> Unit,
    onSignIn: () -> Unit,
    onCountChanged: (Long) -> Unit,
    onOpenProfile: (String) -> Unit,
    postActions: PostActionHandler?,
    modifier: Modifier = Modifier,
) {
    val spacing = LocalRoySpacing.current
    val type = LocalRoyTypeScale.current
    val post = response.post
    val scroll = rememberScrollState()
    val scope = rememberCoroutineScope()
    val composer =
        rememberCommentComposerState(
            slug = slug,
            repository = engagementRepository,
            signedIn = signedIn,
            onSignIn = onSignIn,
        )

    Box(modifier = modifier.fillMaxSize()) {
        Column(
            modifier =
                Modifier.fillMaxSize()
                    .verticalScroll(scroll)
                    .padding(bottom = 96.dp)
                    .testTag(CommunityPostMetrics.POST),
        ) {
        // The page's rhythm, at the phone width: the chip and its facts are one
        // block (`gap-2`), the header closes with `mb-8`, and each of the cover
        // and the tags carries the same `mb-8` (#1573).
        post.author?.let { author ->
            AuthorChip(author, onOpenProfile)
            Spacer(Modifier.height(8.dp))
        }

        PostFacts(post.published_at, post.view_count)
        Spacer(Modifier.height(32.dp))

        val cover = post.cover_image?.takeIf { it.isNotBlank() }
        val hasTags = response.postTags.isNotEmpty()

        if (cover != null) {
            AsyncImage(
                model = cover,
                contentDescription = PostText.label(post.content, post.meta_desc),
                contentScale = ContentScale.Crop,
                modifier =
                    Modifier.fillMaxWidth()
                        .aspectRatio(16f / 9f)
                        .clip(RoundedCornerShape(CommunityPostMetrics.COVER_RADIUS.dp))
                        .background(RoyColors.muted.copy(alpha = 0.6f))
                        .testTag(CommunityPostMetrics.COVER),
            )
            Spacer(Modifier.height(32.dp))
        }

        if (hasTags) {
            Row(
                horizontalArrangement = Arrangement.spacedBy(spacing.elementGapSm),
                modifier = Modifier.fillMaxWidth().testTag(CommunityPostMetrics.TAGS),
            ) {
                response.postTags.forEach { tag ->
                    Text(
                        text = "#${tag.name}",
                        style = type.xs.copy(fontWeight = FontWeight.Bold, lineHeight = 16.sp),
                        color = RoyColors.primary,
                        modifier =
                            Modifier.clip(CircleShape)
                                .background(RoyColors.primary.copy(alpha = 0.1f))
                                .border(1.dp, RoyColors.primary.copy(alpha = 0.2f), CircleShape)
                                .padding(horizontal = spacing.elementGapSm, vertical = 6.dp),
                    )
                }
            }
            Spacer(Modifier.height(32.dp))
        }

        MarkdownBody(
            blocks = CommunityMarkdown.parse(post.content.orEmpty()),
            modifier = Modifier.testTag(CommunityPostMetrics.BODY),
        )

        Spacer(Modifier.height(24.dp))

        Row(
            modifier = Modifier.fillMaxWidth().testTag("community-post-actions"),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Row(horizontalArrangement = Arrangement.spacedBy(2.dp)) {
                PostAction(
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
                PostAction(
                    icon = LucideVectors.MessageCircle,
                    label = PostCardCopy.COMMENT_ACTION,
                    count = engagement?.commentCount,
                    active = false,
                    onClick = { scope.launch { scroll.animateScrollTo(Int.MAX_VALUE) } },
                )
            }
            Row(horizontalArrangement = Arrangement.spacedBy(2.dp)) {
                PostAction(
                    icon = LucideVectors.Share2,
                    label = PostCardCopy.SHARE_ACTION,
                    count = null,
                    active = false,
                    onClick = onSharePost,
                )
                if (postActions != null) {
                    PostActionsMenu(
                        target = post.asPostActionTarget(),
                        handler = postActions,
                        currentUserId = currentUserId,
                    )
                }
            }
        }

            if (engagementRepository != null) {
                PostCommentsSection(
                    slug = slug,
                    repository = engagementRepository,
                    composer = composer,
                    currentUserId = currentUserId,
                    onCountChanged = onCountChanged,
                )
            }

            Spacer(Modifier.height(spacing.elementGap))
        }

        if (engagementRepository != null) {
            PostCommentDock(
                state = composer,
                onSend = { composer.send(scope) },
                modifier = Modifier.align(Alignment.BottomCenter),
            )
        }
    }
}

/** Date and views: the caption of the identity above it. */
@Composable
private fun PostFacts(publishedAt: String?, viewCount: Long) {
    val type = LocalRoyTypeScale.current
    val spacing = LocalRoySpacing.current

    Row(
        horizontalArrangement = Arrangement.spacedBy(spacing.elementGapSm / 2),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (publishedAt != null) {
            Icon(
                imageVector = LucideVectors.Calendar,
                contentDescription = null,
                tint = RoyColors.primary.copy(alpha = 0.7f),
                modifier = Modifier.size(14.dp),
            )
            Text(
                text = PlanDates.label(publishedAt),
                style = type.xs,
                color = RoyColors.mutedForeground,
            )
        }

        if (viewCount > 0) {
            Icon(
                imageVector = LucideVectors.Eye,
                contentDescription = null,
                tint = RoyColors.mutedForeground,
                modifier = Modifier.size(14.dp),
            )
            Text(text = viewCount.toString(), style = type.xs, color = RoyColors.mutedForeground)
        }
    }
}

/** One control under the post: the card's own cell shape (#1573). */
@Composable
private fun PostAction(
    icon: ImageVector,
    label: String,
    count: Long?,
    active: Boolean,
    onClick: () -> Unit,
) {
    val type = LocalRoyTypeScale.current
    val tint = if (active) RoyColors.primary else RoyColors.mutedForeground

    Row(
        modifier =
            Modifier.clip(RoundedCornerShape(12.dp))
                .clickable(onClick = onClick)
                .padding(horizontal = 8.dp, vertical = 8.dp)
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

/** The publisher chip: the page's avatar, name and handle, opening the profile. */
@Composable
private fun AuthorChip(
    author: CommunityPostResponsePostAuthor,
    onOpenProfile: (String) -> Unit,
) {
    val type = LocalRoyTypeScale.current
    val name = author.name.orEmpty()

    // No pill: the page's author line is plain, so the app draws the avatar,
    // the name and the handle on the background with the same gap.
    Row(
        modifier =
            Modifier.clickable { onOpenProfile(author.username) }
                .testTag(CommunityPostMetrics.AUTHOR)
                .semantics {
                    role = Role.Button
                    contentDescription =
                        CommunityPostCopy.AUTHOR_PROFILE_LABEL.replace("{name}", name)
                },
        horizontalArrangement = Arrangement.spacedBy(10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (!author.avatar_url.isNullOrBlank()) {
            AsyncImage(
                model = author.avatar_url,
                contentDescription = name,
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
        Column {
            Text(
                text = name,
                style =
                    type.xs.copy(
                        fontWeight = FontWeight.Bold,
                        lineHeight = 15.sp,
                        platformStyle = PlatformTextStyle(includeFontPadding = false),
                    ),
                color = RoyColors.foreground,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            Text(
                text = "@${author.username}",
                style =
                    type.xs.copy(
                        fontSize = 11.sp,
                        lineHeight = 13.75.sp,
                        platformStyle = PlatformTextStyle(includeFontPadding = false),
                    ),
                color = RoyColors.mutedForeground,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
    }
}

/** The page's root not-found sentence, for a post that has no published row. */
@Composable
private fun NotFound() {
    val spacing = LocalRoySpacing.current
    val type = LocalRoyTypeScale.current

    Column(
        modifier =
            Modifier.fillMaxSize()
                .padding(spacing.containerPadding * 2),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Text(
            text = CommunityPostCopy.NOT_FOUND_TITLE,
            style = type.h2.copy(fontWeight = FontWeight.Bold),
            color = RoyColors.foreground,
            textAlign = TextAlign.Center,
        )
        Text(
            text = CommunityPostCopy.NOT_FOUND_BODY,
            style = type.small,
            color = RoyColors.mutedForeground,
            textAlign = TextAlign.Center,
            modifier = Modifier.padding(top = spacing.elementGapSm),
        )
    }
}

/** Nothing to show: an unreachable server, or one that refused the read. */
@Composable
private fun Unavailable(offline: Boolean, onRetry: () -> Unit) {
    Column(
        modifier =
            Modifier.fillMaxSize()
                .padding(LocalRoySpacing.current.containerPadding * 2),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        if (offline) {
            NeedsConnection(
                message = CommunityFeedCopy.PAGE_ERROR,
                state = NeedsConnectionState.Block,
                onRetry = onRetry,
            )
        } else {
            ReadFailureNotice(
                message = CommunityFeedCopy.PAGE_ERROR,
                state = ReadFailureState.Failed,
                onRetry = onRetry,
            )
        }
    }
}

/** The page's skeleton: a cover block, a publisher line and the body lines. */
@Composable
private fun PostSkeleton() {
    val spacing = LocalRoySpacing.current

    Column(
        modifier =
            Modifier.fillMaxSize()
                .padding(horizontal = spacing.containerPadding * 2, vertical = spacing.elementGapSm),
        verticalArrangement = Arrangement.spacedBy(spacing.elementGap),
    ) {
        Box(
            modifier =
                Modifier.fillMaxWidth()
                    .height(44.dp)
                    .clip(CircleShape)
                    .background(RoyColors.muted.copy(alpha = 0.5f)),
        )
        Box(
            modifier =
                Modifier.fillMaxWidth()
                    .aspectRatio(16f / 9f)
                    .clip(RoundedCornerShape(24.dp))
                    .background(RoyColors.muted.copy(alpha = 0.5f)),
        )
        repeat(3) {
            Box(
                modifier =
                    Modifier.fillMaxWidth()
                        .height(16.dp)
                        .clip(RoundedCornerShape(8.dp))
                        .background(RoyColors.muted.copy(alpha = 0.5f)),
            )
        }
    }
}
