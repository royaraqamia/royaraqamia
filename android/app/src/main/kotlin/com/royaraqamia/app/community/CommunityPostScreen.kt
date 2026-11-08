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
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
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
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import coil.compose.AsyncImage
import com.royaraqamia.app.contracts.ApiError
import com.royaraqamia.app.contracts.generated.CommunityPostResponse
import com.royaraqamia.app.contracts.generated.CommunityPostResponsePostAuthor
import com.royaraqamia.app.plans.PlanDates
import com.royaraqamia.app.shared.NeedsConnection
import com.royaraqamia.app.shared.NeedsConnectionState
import com.royaraqamia.app.shared.ReadFailureNotice
import com.royaraqamia.app.shared.ReadFailureState
import com.royaraqamia.app.theme.LocalRoySpacing
import com.royaraqamia.app.theme.LocalRoyTypeScale
import com.royaraqamia.app.theme.RoyColors
import com.royaraqamia.app.ui.vectors.LucideVectors

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
}

/**
 * `/community/[slug]` as a screen (#922).
 *
 * The page draws one published post: the publisher chip, the cover, the tags, the
 * publication date and the Markdown body. The app draws the same parts from the
 * same route (`GET /api/community/{slug}`) and the same words
 * ([CommunityPostCopy]), with the body converted by [CommunityMarkdown] because
 * the app has no Markdown runtime.
 *
 * The two faces the server decides are [CommunityPostUiState.AtRest] and
 * [CommunityPostUiState.NotFound]; a read that never answered is the shared
 * read-failure or needs-connection notice, kept apart for the reason ADR-0031
 * gives. The port is switched off until the visual gate passes (ADR-0117), so the
 * shell still hands the route to the document in the meantime.
 */
@Composable
fun CommunityPostScreen(
    slug: String,
    repository: CommunityPostRepository,
    modifier: Modifier = Modifier,
    onOpenProfile: (String) -> Unit = {},
) {
    var state by remember(slug) { mutableStateOf<CommunityPostUiState?>(null) }
    var failure by remember(slug) { mutableStateOf<ApiError?>(null) }
    var attempts by remember(slug) { mutableStateOf(0) }

    LaunchedEffect(slug, attempts) {
        state = null
        failure = null
        val result = repository.post(slug)
        state = CommunityPostUiState.of(result, slug)
        failure = (result as? CommunityPostResult.Unavailable)?.error
    }

    CommunityPostContent(
        state = state,
        failure = failure,
        onRetry = { attempts += 1 },
        onOpenProfile = onOpenProfile,
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
        onRetry = onRetry,
        onOpenProfile = onOpenProfile,
        modifier = modifier,
    )
}

@Composable
private fun CommunityPostContent(
    state: CommunityPostUiState?,
    failure: ApiError?,
    onRetry: () -> Unit,
    onOpenProfile: (String) -> Unit,
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
                    onOpenProfile = onOpenProfile,
                    modifier = Modifier.padding(horizontal = spacing.containerPadding * 2),
                )
        }
    }
}

/** The post the server answered, in the page's reading order. */
@Composable
private fun Post(
    response: CommunityPostResponse,
    onOpenProfile: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    val spacing = LocalRoySpacing.current
    val type = LocalRoyTypeScale.current
    val post = response.post

    Column(
        modifier =
            modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .testTag(CommunityPostMetrics.POST)
                .padding(vertical = spacing.elementGapSm),
        verticalArrangement = Arrangement.spacedBy(spacing.elementGap),
    ) {
        post.author?.let { author -> AuthorChip(author, onOpenProfile) }

        post.cover_image?.takeIf { it.isNotBlank() }?.let { cover ->
            AsyncImage(
                model = cover,
                contentDescription = PostText.label(post.content, post.meta_desc),
                contentScale = ContentScale.Crop,
                modifier =
                    Modifier.fillMaxWidth()
                        .aspectRatio(16f / 9f)
                        .clip(RoundedCornerShape(24.dp))
                        .background(RoyColors.muted.copy(alpha = 0.6f))
                        .testTag(CommunityPostMetrics.COVER),
            )
        }

        if (response.postTags.isNotEmpty()) {
            Column(
                modifier = Modifier.fillMaxWidth().testTag(CommunityPostMetrics.TAGS),
                verticalArrangement = Arrangement.spacedBy(spacing.elementGapSm),
            ) {
                HorizontalDivider(color = RoyColors.border.copy(alpha = 0.4f))
                Row(horizontalArrangement = Arrangement.spacedBy(spacing.elementGapSm)) {
                    response.postTags.forEach { tag ->
                        Text(
                            text = "#${tag.name}",
                            style = type.xs.copy(fontWeight = FontWeight.Bold),
                            color = RoyColors.primary,
                            modifier =
                                Modifier.clip(CircleShape)
                                    .background(RoyColors.primary.copy(alpha = 0.1f))
                                    .border(1.dp, RoyColors.primary.copy(alpha = 0.2f), CircleShape)
                                    .padding(horizontal = spacing.elementGapSm, vertical = 6.dp),
                        )
                    }
                }
                HorizontalDivider(color = RoyColors.border.copy(alpha = 0.4f))
            }
        }

        post.published_at?.let { published ->
            Row(
                horizontalArrangement = Arrangement.spacedBy(spacing.elementGapSm / 2),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Icon(
                    imageVector = LucideVectors.Calendar,
                    contentDescription = null,
                    tint = RoyColors.primary.copy(alpha = 0.7f),
                    modifier = Modifier.size(14.dp),
                )
                Text(
                    text = PlanDates.label(published),
                    style = type.xs,
                    color = RoyColors.mutedForeground,
                )
            }
        }

        MarkdownBody(
            blocks = CommunityMarkdown.parse(post.content.orEmpty()),
            modifier = Modifier.testTag(CommunityPostMetrics.BODY),
        )

        Spacer(Modifier.height(spacing.elementGap))
    }
}

/** The publisher chip: the page's avatar, name and handle, opening the profile. */
@Composable
private fun AuthorChip(
    author: CommunityPostResponsePostAuthor,
    onOpenProfile: (String) -> Unit,
) {
    val type = LocalRoyTypeScale.current
    val spacing = LocalRoySpacing.current
    val name = author.name.orEmpty()

    Row(
        modifier =
            Modifier.clip(CircleShape)
                .background(RoyColors.muted.copy(alpha = 0.3f))
                .border(1.dp, RoyColors.border.copy(alpha = 0.4f), CircleShape)
                .clickable { onOpenProfile(author.username) }
                .padding(horizontal = spacing.elementGapSm, vertical = 6.dp)
                .testTag(CommunityPostMetrics.AUTHOR)
                .semantics {
                    role = Role.Button
                    contentDescription =
                        CommunityPostCopy.AUTHOR_PROFILE_LABEL.replace("{name}", name)
                },
        horizontalArrangement = Arrangement.spacedBy(spacing.elementGapSm),
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
