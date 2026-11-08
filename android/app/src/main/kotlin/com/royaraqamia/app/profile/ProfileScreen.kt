package com.royaraqamia.app.profile

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextDirection
import androidx.compose.ui.unit.dp
import coil.compose.AsyncImage
import com.royaraqamia.app.community.CommunityFeedCopy
import com.royaraqamia.app.community.PostCard
import com.royaraqamia.app.contracts.ApiError
import com.royaraqamia.app.contracts.generated.CommunityIndexResponsePostsItem
import com.royaraqamia.app.contracts.generated.CommunityIndexResponsePostsItemAuthor
import com.royaraqamia.app.contracts.generated.CommunityIndexResponsePostsItemStatus
import com.royaraqamia.app.contracts.generated.CommunityMemberResponseMember
import com.royaraqamia.app.contracts.generated.CommunityMemberResponsePostsItem
import com.royaraqamia.app.contracts.generated.CommunityMemberResponsePostsItemStatus
import com.royaraqamia.app.shared.NeedsConnection
import com.royaraqamia.app.shared.NeedsConnectionState
import com.royaraqamia.app.shared.ReadFailureNotice
import com.royaraqamia.app.shared.ReadFailureState
import com.royaraqamia.app.theme.LocalRoySpacing
import com.royaraqamia.app.theme.LocalRoyTypeScale
import com.royaraqamia.app.theme.Recipes
import com.royaraqamia.app.theme.RoyColors
import com.royaraqamia.app.ui.vectors.LucideVectors

/**
 * The visual gate's handles on a public profile (#927,
 * `shared/visual/profile.json`).
 *
 * The page's own boxes are named here so a later recording can compare them:
 * the header card, the member's name and the posts heading.
 */
object ProfileMetrics {
    const val HEADER = "profile-header"
    const val NAME = "profile-name"
    const val POSTS = "profile-posts"
    const val HEADER_RADIUS = 24
}

/**
 * `/u/[username]` as a screen (#927).
 *
 * The page draws one public member: their avatar, name, handle, bio, then the
 * posts they published, or the empty card when they have none. The app draws the
 * same parts from the same route (`GET /api/u/{username}`) and the same words
 * ([ProfileCopy]). A handle the server refuses — unknown or hidden, which the
 * page turns into `notFound()` — is [ProfileUiState.NotFound] and the page's own
 * sentence, not an empty profile.
 *
 * The port is switched off until the visual gate passes (ADR-0117), so the shell
 * still hands the route to the document in the meantime. A read that never
 * reached an answer is the shared read-failure/needs-connection notice, kept
 * apart from the not-found for the reason ADR-0031 gives.
 */
@Composable
fun ProfileScreen(
    username: String,
    repository: ProfileRepository,
    modifier: Modifier = Modifier,
    onOpenPost: (String) -> Unit = {},
    onOpenProfile: (String) -> Unit = {},
) {
    var state by remember(username) { mutableStateOf<ProfileUiState?>(null) }
    var failure by remember(username) { mutableStateOf<ApiError?>(null) }
    var attempts by remember(username) { mutableStateOf(0) }

    LaunchedEffect(username, attempts) {
        state = null
        failure = null
        val result = repository.profile(username)
        state = ProfileUiState.of(result, username)
        failure = (result as? ProfileResult.Unavailable)?.error
    }

    ProfileContent(
        state = state,
        failure = failure,
        onRetry = { attempts += 1 },
        onOpenPost = onOpenPost,
        onOpenProfile = onOpenProfile,
        modifier = modifier,
    )
}

/** The screen over a state the caller already decided, so a test can draw each face. */
@Composable
internal fun ProfileScreen(
    state: ProfileUiState?,
    failure: ApiError?,
    onRetry: () -> Unit,
    onOpenPost: (String) -> Unit,
    onOpenProfile: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    ProfileContent(
        state = state,
        failure = failure,
        onRetry = onRetry,
        onOpenPost = onOpenPost,
        onOpenProfile = onOpenProfile,
        modifier = modifier,
    )
}

@Composable
private fun ProfileContent(
    state: ProfileUiState?,
    failure: ApiError?,
    onRetry: () -> Unit,
    onOpenPost: (String) -> Unit,
    onOpenProfile: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    Box(modifier = modifier.fillMaxSize()) {
        when {
            failure != null ->
                Unavailable(offline = failure is ApiError.Network, onRetry = onRetry)

            state == null -> ProfileSkeleton()

            state is ProfileUiState.NotFound -> NotFound()

            state is ProfileUiState.AtRest ->
                Profile(
                    member = state.member,
                    posts = state.posts,
                    onOpenPost = onOpenPost,
                    onOpenProfile = onOpenProfile,
                )

            state is ProfileUiState.Empty ->
                Profile(
                    member = state.member,
                    posts = emptyList(),
                    onOpenPost = onOpenPost,
                    onOpenProfile = onOpenProfile,
                )
        }
    }
}

/** The header and the member's posts, in the page's reading order. */
@Composable
private fun Profile(
    member: CommunityMemberResponseMember,
    posts: List<CommunityMemberResponsePostsItem>,
    onOpenPost: (String) -> Unit,
    onOpenProfile: (String) -> Unit,
) {
    val spacing = LocalRoySpacing.current
    val type = LocalRoyTypeScale.current
    val name = displayName(member)

    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding =
            PaddingValues(
                horizontal = spacing.containerPadding,
                vertical = spacing.elementGapSm,
            ),
        verticalArrangement = Arrangement.spacedBy(spacing.elementGap),
    ) {
        item { Header(member = member, name = name) }

        item {
            Text(
                text = ProfileCopy.POSTS_HEADING,
                style = type.h2.copy(fontWeight = FontWeight.Bold),
                color = RoyColors.foreground,
                modifier = Modifier.fillMaxWidth().testTag(ProfileMetrics.POSTS),
            )
        }

        if (posts.isEmpty()) {
            item { EmptyProfile(name = name) }
        } else {
            items(posts, key = { it.id }) { post ->
                PostCard(
                    post = post.asFeedItem(),
                    onOpen = { onOpenPost(post.slug) },
                    onOpenAuthor = onOpenProfile,
                )
            }
        }
    }
}

/** The page's header card: the avatar, the display name, the handle and the bio. */
@Composable
private fun Header(member: CommunityMemberResponseMember, name: String) {
    val spacing = LocalRoySpacing.current
    val type = LocalRoyTypeScale.current
    val initial = member.name?.trim()?.firstOrNull()

    Column(
        modifier =
            Modifier.fillMaxWidth()
                .clip(RoundedCornerShape(ProfileMetrics.HEADER_RADIUS.dp))
                .background(RoyColors.card.copy(alpha = 0.4f))
                .border(
                    1.dp,
                    RoyColors.border.copy(alpha = 0.6f),
                    RoundedCornerShape(ProfileMetrics.HEADER_RADIUS.dp),
                )
                .padding(24.dp)
                .testTag(ProfileMetrics.HEADER),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(spacing.elementGapSm),
    ) {
        Box(
            modifier =
                Modifier.size(80.dp)
                    .clip(CircleShape)
                    .background(RoyColors.muted.copy(alpha = 0.6f))
                    .border(2.dp, RoyColors.primary.copy(alpha = 0.35f), CircleShape),
            contentAlignment = Alignment.Center,
        ) {
            when {
                !member.avatar_url.isNullOrBlank() ->
                    AsyncImage(
                        model = member.avatar_url,
                        contentDescription = name,
                        contentScale = ContentScale.Crop,
                        modifier = Modifier.size(80.dp).clip(CircleShape),
                    )
                initial != null ->
                    Text(
                        text = initial.toString(),
                        style = type.h2.copy(fontWeight = FontWeight.Bold),
                        color = RoyColors.primary,
                    )
                else ->
                    Icon(
                        imageVector = LucideVectors.User,
                        contentDescription = null,
                        tint = RoyColors.mutedForeground,
                        modifier = Modifier.size(32.dp),
                    )
            }
        }

        Text(
            text = name,
            style = type.h2.copy(fontWeight = FontWeight.Bold),
            color = RoyColors.foreground,
            textAlign = TextAlign.Center,
            modifier = Modifier.testTag(ProfileMetrics.NAME),
        )
        Text(
            text = "@${member.username}",
            style = type.small.copy(textDirection = TextDirection.Ltr),
            color = RoyColors.mutedForeground,
        )
        member.bio?.trim()?.takeIf { it.isNotEmpty() }?.let { bio ->
            Text(
                text = bio,
                style = type.small,
                color = RoyColors.mutedForeground,
                textAlign = TextAlign.Center,
            )
        }
    }
}

/** The page's empty card: its glyph, its title and its sentence. */
@Composable
private fun EmptyProfile(name: String) {
    val type = LocalRoyTypeScale.current
    val spacing = LocalRoySpacing.current

    Column(
        modifier =
            Modifier.fillMaxWidth()
                .clip(Recipes.Card.radius)
                .background(RoyColors.card.copy(alpha = 0.4f))
                .border(1.dp, RoyColors.border.copy(alpha = 0.6f), Recipes.Card.radius)
                .padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(spacing.elementGapSm),
    ) {
        Box(
            modifier =
                Modifier.size(64.dp)
                    .background(RoyColors.muted.copy(alpha = 0.5f), Recipes.Card.radius),
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                imageVector = LucideVectors.FileText,
                contentDescription = null,
                tint = RoyColors.mutedForeground,
                modifier = Modifier.size(32.dp),
            )
        }
        Text(
            text = ProfileCopy.EMPTY_TITLE,
            style = type.h2.copy(fontWeight = FontWeight.Bold),
            color = RoyColors.foreground,
            textAlign = TextAlign.Center,
        )
        Text(
            text = ProfileCopy.EMPTY_BODY.replace("{name}", name),
            style = type.small,
            color = RoyColors.mutedForeground,
            textAlign = TextAlign.Center,
        )
    }
}

/** The page's root not-found sentence, for an unknown or hidden handle. */
@Composable
private fun NotFound() {
    val spacing = LocalRoySpacing.current
    val type = LocalRoyTypeScale.current

    Column(
        modifier = Modifier.fillMaxSize().padding(spacing.containerPadding * 2),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Text(
            text = ProfileCopy.NOT_FOUND_TITLE,
            style = type.h2.copy(fontWeight = FontWeight.Bold),
            color = RoyColors.foreground,
            textAlign = TextAlign.Center,
        )
        Text(
            text = ProfileCopy.NOT_FOUND_BODY,
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
        modifier = Modifier.fillMaxSize().padding(LocalRoySpacing.current.containerPadding * 2),
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

/** The page's skeleton: the header card and the posts heading under it. */
@Composable
private fun ProfileSkeleton() {
    val spacing = LocalRoySpacing.current

    Column(
        modifier =
            Modifier.fillMaxSize()
                .padding(horizontal = spacing.containerPadding, vertical = spacing.elementGapSm),
        verticalArrangement = Arrangement.spacedBy(spacing.elementGap),
    ) {
        Box(
            modifier =
                Modifier.fillMaxWidth()
                    .height(220.dp)
                    .clip(RoundedCornerShape(ProfileMetrics.HEADER_RADIUS.dp))
                    .background(RoyColors.muted.copy(alpha = 0.5f)),
        )
        Box(
            modifier =
                Modifier.fillMaxWidth()
                    .height(16.dp)
                    .clip(RoundedCornerShape(8.dp))
                    .background(RoyColors.muted.copy(alpha = 0.5f)),
        )
    }
}

/** The member's display name, exactly as the page chooses it. */
private fun displayName(member: CommunityMemberResponseMember): String =
    member.name?.trim()?.takeIf { it.isNotEmpty() } ?: "@${member.username}"

/**
 * The profile's post row as the feed card's shape.
 *
 * The two contracts are the same `PostSummary` schema, but the generator names
 * the Kotlin type after the response that carries it, so the card — one drawing
 * for both surfaces — takes the feed's type. The mapping is field for field and
 * is the only place the two generated names meet.
 */
private fun CommunityMemberResponsePostsItem.asFeedItem(): CommunityIndexResponsePostsItem =
    CommunityIndexResponsePostsItem(
        id = id,
        author_id = author_id,
        client_id = client_id,
        deleted_at = deleted_at,
        slug = slug,
        content = content,
        status =
            when (status) {
                CommunityMemberResponsePostsItemStatus.DRAFT ->
                    CommunityIndexResponsePostsItemStatus.DRAFT
                CommunityMemberResponsePostsItemStatus.PUBLISHED ->
                    CommunityIndexResponsePostsItemStatus.PUBLISHED
                CommunityMemberResponsePostsItemStatus.SCHEDULED ->
                    CommunityIndexResponsePostsItemStatus.SCHEDULED
            },
        cover_image = cover_image,
        meta_title = meta_title,
        meta_desc = meta_desc,
        published_at = published_at,
        publish_at = publish_at,
        view_count = view_count,
        featured = featured,
        community_visible = community_visible,
        reading_time_minutes = reading_time_minutes,
        created_at = created_at,
        updated_at = updated_at,
        author =
            author?.let {
                CommunityIndexResponsePostsItemAuthor(
                    username = it.username,
                    name = it.name,
                    avatar_url = it.avatar_url,
                )
            },
    )
