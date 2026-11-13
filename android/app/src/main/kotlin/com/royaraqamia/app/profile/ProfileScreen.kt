package com.royaraqamia.app.profile

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
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
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.PlatformTextStyle
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.LineHeightStyle
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextDirection
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import com.royaraqamia.app.community.CommunityFeedCopy
import com.royaraqamia.app.community.PostCard
import com.royaraqamia.app.contracts.ApiError
import com.royaraqamia.app.contracts.ApiResult
import com.royaraqamia.app.contracts.generated.CommunityIndexResponsePostsItem
import com.royaraqamia.app.contracts.generated.CommunityIndexResponsePostsItemAuthor
import com.royaraqamia.app.contracts.generated.CommunityIndexResponsePostsItemStatus
import com.royaraqamia.app.contracts.generated.CommunityMemberResponseMember
import com.royaraqamia.app.contracts.generated.CommunityMemberResponsePostsItem
import com.royaraqamia.app.contracts.generated.CommunityMemberResponsePostsItemStatus
import com.royaraqamia.app.contracts.generated.FollowToggleResponseState
import com.royaraqamia.app.shared.NeedsConnection
import com.royaraqamia.app.shared.NeedsConnectionState
import com.royaraqamia.app.shared.ReadFailureNotice
import com.royaraqamia.app.shared.ReadFailureState
import com.royaraqamia.app.shared.SignInPrompt
import com.royaraqamia.app.theme.LocalRoySpacing
import com.royaraqamia.app.theme.LocalRoyTypeScale
import com.royaraqamia.app.theme.Recipes
import com.royaraqamia.app.theme.RoyColors
import com.royaraqamia.app.theme.RoyFonts
import com.royaraqamia.app.ui.vectors.LucideVectors
import kotlinx.coroutines.launch

/**
 * The visual gate's handles on a public profile (#927,
 * `shared/visual/profile.json`).
 *
 * The page's own boxes are named here so a later recording can compare them:
 * the header card, the member's name, the bio, the posts heading and the first
 * post card. The numbers the page's own components carry (`text-2xl`, the
 * `text-lg` posts heading, `leading-relaxed`) are repeated here because Compose
 * does not expose resolved typography through the semantics tree, and the gate
 * measures the page's computed style.
 */
object ProfileMetrics {
    const val HEADER = "profile-header"
    const val NAME = "profile-name"
    const val BIO = "profile-bio"
    const val POSTS = "profile-posts"
    const val HEADER_RADIUS = 24

    const val NAME_FONT_SIZE = 24f
    const val NAME_LINE_HEIGHT = 32f
    const val NAME_LETTER_SPACING_EM = -0.025f

    const val BIO_FONT_SIZE = 14f
    const val BIO_LINE_HEIGHT = 22.75f

    const val POSTS_FONT_SIZE = 18f
    const val POSTS_LINE_HEIGHT = 28f
    const val POSTS_LETTER_SPACING_EM = -0.025f

    /**
     * CSS measures a text box by its `line-height`, not by the font's own
     * ascent and descent. Compose's default font padding would make the two
     * clients report different heights for the same words, so the page's three
     * lines opt out of it and centre the glyphs in the line box.
     */
    private val pageTextPlatform = PlatformTextStyle(includeFontPadding = false)

    private val pageLineHeight =
        LineHeightStyle(
            alignment = LineHeightStyle.Alignment.Center,
            trim = LineHeightStyle.Trim.None,
        )

    /** The page's `text-2xl font-bold tracking-tight`. */
    val nameStyle: TextStyle =
        TextStyle(
            fontFamily = RoyFonts.ui,
            fontWeight = FontWeight.Bold,
            fontSize = NAME_FONT_SIZE.sp,
            lineHeight = NAME_LINE_HEIGHT.sp,
            letterSpacing = NAME_LETTER_SPACING_EM.em,
            platformStyle = pageTextPlatform,
            lineHeightStyle = pageLineHeight,
        )

    /** The page's `text-sm leading-relaxed`. */
    val bioStyle: TextStyle =
        TextStyle(
            fontFamily = RoyFonts.ui,
            fontSize = BIO_FONT_SIZE.sp,
            lineHeight = BIO_LINE_HEIGHT.sp,
            platformStyle = pageTextPlatform,
            lineHeightStyle = pageLineHeight,
        )

    /** The page's `text-lg font-bold tracking-tight`. */
    val postsStyle: TextStyle =
        TextStyle(
            fontFamily = RoyFonts.ui,
            fontWeight = FontWeight.Bold,
            fontSize = POSTS_FONT_SIZE.sp,
            lineHeight = POSTS_LINE_HEIGHT.sp,
            letterSpacing = POSTS_LETTER_SPACING_EM.em,
            platformStyle = pageTextPlatform,
            lineHeightStyle = pageLineHeight,
        )
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
    onOpenChat: (String) -> Unit = {},
    onSignIn: () -> Unit = {},
) {
    var state by remember(username) { mutableStateOf<ProfileUiState?>(null) }
    var failure by remember(username) { mutableStateOf<ApiError?>(null) }
    var attempts by remember(username) { mutableStateOf(0) }
    var standing by remember(username) { mutableStateOf<ProfileStanding>(ProfileStanding.Loading) }
    var busy by remember(username) { mutableStateOf(false) }
    var actionError by remember(username) { mutableStateOf<String?>(null) }
    var promptingSignIn by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()

    LaunchedEffect(username, attempts) {
        state = null
        failure = null
        actionError = null
        standing = ProfileStanding.Loading
        val result = repository.profile(username)
        state = ProfileUiState.of(result, username)
        failure = (result as? ProfileResult.Unavailable)?.error
        standing = readStanding(repository, username)
    }

    /** One press on the control: the write, then the state its own answer names. */
    fun press(action: ProfileAction) {
        scope.launch {
            busy = true
            actionError = null
            try {
                when (action) {
                    ProfileAction.Follow,
                    ProfileAction.Unfollow -> {
                        val result =
                            if (action == ProfileAction.Follow) repository.follow(username)
                            else repository.unfollow(username)
                        when (result) {
                            is ApiResult.Success -> {
                                val body = result.value
                                // A refusal is not a state change, except `blocked`,
                                // which is a state the control has a face for.
                                if (body.success) {
                                    standing = ProfileStanding.Known(body.state)
                                } else {
                                    actionError =
                                        body.error
                                            ?: if (action == ProfileAction.Follow) {
                                                FollowButtonCopy.FOLLOW_FAILED
                                            } else {
                                                FollowButtonCopy.UNFOLLOW_FAILED
                                            }
                                    if (body.state == FollowToggleResponseState.BLOCKED) {
                                        standing = ProfileStanding.Known(body.state)
                                    }
                                }
                            }
                            is ApiResult.Failure ->
                                if (result.error is ApiError.NotSignedIn) {
                                    promptingSignIn = true
                                } else {
                                    actionError =
                                        if (action == ProfileAction.Follow) {
                                            FollowButtonCopy.FOLLOW_FAILED
                                        } else {
                                            FollowButtonCopy.UNFOLLOW_FAILED
                                        }
                                }
                        }
                    }
                    ProfileAction.Unblock -> {
                        val memberId = memberIdOf(state)
                        when (val result = memberId?.let { repository.unblock(it) }) {
                            is ApiResult.Success<*> ->
                                standing = ProfileStanding.Known(FollowToggleResponseState.NOT_FOLLOWING)
                            is ApiResult.Failure ->
                                if (result.error is ApiError.NotSignedIn) {
                                    promptingSignIn = true
                                } else {
                                    actionError = FollowButtonCopy.UNBLOCK_FAILED
                                }
                            null -> actionError = FollowButtonCopy.UNBLOCK_FAILED
                        }
                    }
                }
            } finally {
                busy = false
            }
        }
    }

    /**
     * The site's gate at the door: a visitor whose standing is [ProfileStanding.Guest]
     * sees the controls and is asked to sign in, rather than being shown a header
     * with two doors and no way through either.
     */
    fun gated(open: () -> Unit) {
        if (standing == ProfileStanding.Guest) promptingSignIn = true else open()
    }

    ProfileContent(
        state = state,
        failure = failure,
        onRetry = { attempts += 1 },
        onOpenPost = onOpenPost,
        onOpenProfile = onOpenProfile,
        chrome =
            ProfileChrome(
                standing = standing,
                busy = busy,
                error = actionError,
                onFollow = { gated { press(ProfileAction.Follow) } },
                onUnfollow = { press(ProfileAction.Unfollow) },
                onUnblock = { press(ProfileAction.Unblock) },
                onOpenChat = { gated { onOpenChat(username) } },
            ),
        modifier = modifier,
    )

    if (promptingSignIn) {
        SignInPrompt(
            onDismiss = { promptingSignIn = false },
            onConfirm = {
                promptingSignIn = false
                onSignIn()
            },
        )
    }
}

/** The write a press means; one name so the scope above reads as one handler. */
private enum class ProfileAction { Follow, Unfollow, Unblock }

/** The member the profile is showing, whichever face it is on. */
private fun memberIdOf(state: ProfileUiState?): String? =
    when (state) {
        is ProfileUiState.AtRest -> state.member.id
        is ProfileUiState.Empty -> state.member.id
        is ProfileUiState.NotFound -> null
        null -> null
    }

/**
 * The viewer's standing, read beside the profile so the header draws its own
 * control in the first frame it has a header for.
 *
 * A 401 is the site's own guest gate rather than a failure: the page shows a
 * visitor the same buttons and sends the press to sign-in.
 */
private suspend fun readStanding(
    repository: ProfileRepository,
    username: String,
): ProfileStanding =
    when (val result = repository.standing(username)) {
        is ApiResult.Success ->
            if (result.value.success) {
                ProfileStanding.Known(result.value.state)
            } else {
                ProfileStanding.Unavailable
            }
        is ApiResult.Failure ->
            if (result.error is ApiError.NotSignedIn) ProfileStanding.Guest
            else ProfileStanding.Unavailable
    }

/** The header's viewer chrome: what the control draws and what a press does. */
private data class ProfileChrome(
    val standing: ProfileStanding,
    val busy: Boolean,
    val error: String?,
    val onFollow: () -> Unit,
    val onUnfollow: () -> Unit,
    val onUnblock: () -> Unit,
    val onOpenChat: () -> Unit,
) {
    companion object {
        /** A screen drawn over a state alone: no viewer, so no control. */
        val none =
            ProfileChrome(
                standing = ProfileStanding.Unavailable,
                busy = false,
                error = null,
                onFollow = {},
                onUnfollow = {},
                onUnblock = {},
                onOpenChat = {},
            )
    }
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
        chrome = ProfileChrome.none,
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
    chrome: ProfileChrome,
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
                    chrome = chrome,
                    onOpenPost = onOpenPost,
                    onOpenProfile = onOpenProfile,
                )

            state is ProfileUiState.Empty ->
                Profile(
                    member = state.member,
                    posts = emptyList(),
                    chrome = chrome,
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
    chrome: ProfileChrome,
    onOpenPost: (String) -> Unit,
    onOpenProfile: (String) -> Unit,
) {
    val spacing = LocalRoySpacing.current
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
        item { Header(member = member, name = name, chrome = chrome) }

        item {
            Text(
                text = ProfileCopy.POSTS_HEADING,
                style = ProfileMetrics.postsStyle,
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
private fun Header(member: CommunityMemberResponseMember, name: String, chrome: ProfileChrome) {
    val spacing = LocalRoySpacing.current
    val type = LocalRoyTypeScale.current
    val initial = member.name?.trim()?.firstOrNull()

    Column(
        modifier =
            Modifier.fillMaxWidth()
                .testTag(ProfileMetrics.HEADER)
                .clip(RoundedCornerShape(ProfileMetrics.HEADER_RADIUS.dp))
                .background(RoyColors.card.copy(alpha = 0.4f))
                .border(
                    1.dp,
                    RoyColors.border.copy(alpha = 0.6f),
                    RoundedCornerShape(ProfileMetrics.HEADER_RADIUS.dp),
                )
                .padding(24.dp),
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

        Box(
            modifier =
                Modifier.fillMaxWidth()
                    .height(ProfileMetrics.NAME_LINE_HEIGHT.dp)
                    .testTag(ProfileMetrics.NAME),
            contentAlignment = Alignment.Center,
        ) {
            Text(
                text = name,
                style = ProfileMetrics.nameStyle,
                color = RoyColors.foreground,
                textAlign = TextAlign.Center,
            )
        }
        Text(
            text = "@${member.username}",
            style = type.small.copy(textDirection = TextDirection.Ltr),
            color = RoyColors.mutedForeground,
        )
        member.bio?.trim()?.takeIf { it.isNotEmpty() }?.let { bio ->
            Text(
                text = bio,
                style = ProfileMetrics.bioStyle,
                color = RoyColors.mutedForeground,
                textAlign = TextAlign.Center,
                modifier = Modifier.testTag(ProfileMetrics.BIO),
            )
        }

        // The page's two doors: the follow control and the quiet «مراسلة». The
        // viewer's own page draws the «أنت» pill and no chat, because there is
        // nothing to follow and nobody to write to.
        val face = FollowButtonUiState.of(chrome.standing)
        if (face != null) {
            Row(
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                FollowButton(
                    state = face,
                    name = name,
                    busy = chrome.busy,
                    error = chrome.error,
                    onFollow = chrome.onFollow,
                    onUnfollow = chrome.onUnfollow,
                    onUnblock = chrome.onUnblock,
                )
                if (face != FollowButtonUiState.Self) {
                    ProfileChatCta(onClick = chrome.onOpenChat)
                }
            }
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
