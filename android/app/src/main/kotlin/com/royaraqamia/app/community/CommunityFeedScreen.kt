package com.royaraqamia.app.community

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
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
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.royaraqamia.app.contracts.ApiResult
import com.royaraqamia.app.contracts.generated.CommunityIndexResponsePostsItem
import com.royaraqamia.app.shared.NeedsConnection
import com.royaraqamia.app.shared.NeedsConnectionState
import com.royaraqamia.app.shared.ReadFailureNotice
import com.royaraqamia.app.shared.ReadFailureState
import com.royaraqamia.app.theme.LocalRoySpacing
import com.royaraqamia.app.theme.LocalRoyTypeScale
import com.royaraqamia.app.theme.Recipes
import com.royaraqamia.app.theme.RoyColors
import com.royaraqamia.app.ui.vectors.LucideVectors
import kotlinx.coroutines.launch

/**
 * The visual gate's handles on the feed (#901, `shared/visual/community.json`).
 *
 * The card's tags live on the components the screen ships rather than on a copy
 * the test draws, so what is measured is what a member sees. The load-more's box
 * is the page's own pill: 44dp tall with the label's 14sp bold type and 32dp of
 * horizontal padding, because the page's anchor is `h-11 px-8 text-sm font-bold`.
 */
object CommunityFeedMetrics {
    const val CARD = "community-card"
    const val CARD_CONTENT = "community-card-content"
    const val LOAD_MORE = "community-load-more"
    const val LOAD_MORE_REGION = "community-load-more-region"
    const val CARD_RADIUS = 24
    const val LOAD_MORE_HEIGHT = 44
    const val LOAD_MORE_PADDING = 32
}

/**
 * `/community` as a screen (#658).
 *
 * The page's feed, and nothing around it: the search box, the members strip and
 * the compose button are the page's chrome, and the app draws its own shell
 * instead. What is ported is the part a member comes for — the cards, the empty
 * state, the load-more control and the two answers a failed read gets.
 *
 * The offline face is the matrix's promise kept: the last page this device read
 * is painted with the banner the page uses, which says these are the posts it saw
 * rather than today's. With nothing kept, the failure is the whole screen and the
 * retry is the only control — and the two failures stay apart, because an
 * unreachable server and a refusal are not the same sentence (ADR-0031).
 */
@Composable
fun CommunityFeedScreen(
    repository: CommunityFeedRepository,
    modifier: Modifier = Modifier,
    onOpenPost: (String) -> Unit = {},
    onOpenProfile: (String) -> Unit = {},
    editorStore: CommunityEditorStore? = null,
    signedIn: Boolean = false,
    currentUserId: String? = null,
) {
    val spacing = LocalRoySpacing.current
    val scope = rememberCoroutineScope()

    var state by remember { mutableStateOf<CommunityFeedUiState?>(null) }
    var attempts by remember { mutableStateOf(0) }
    var loadingMore by remember { mutableStateOf(false) }
    var loadMoreFailed by remember { mutableStateOf(false) }
    var editing by remember { mutableStateOf<CommunityIndexResponsePostsItem?>(null) }

    /** The member's own posts are the ones the editor may open (#925). */
    fun canEdit(post: CommunityIndexResponsePostsItem): Boolean =
        editorStore != null && currentUserId != null && post.author_id == currentUserId

    LaunchedEffect(repository, attempts) {
        state = null
        loadMoreFailed = false
        loadingMore = false
        state = CommunityFeedUiState.of(repository.firstPage())
    }

    val loadMore: () -> Unit = {
        val live = state as? CommunityFeedUiState.Live
        val cursor = live?.nextCursor
        if (cursor != null && !loadingMore) {
            scope.launch {
                loadingMore = true
                loadMoreFailed = false
                when (val result = repository.page(cursor)) {
                    is ApiResult.Success -> {
                        val merged = live.posts + result.value.posts
                        repository.remember(merged, result.value.nextCursor)
                        state = CommunityFeedUiState.Live(merged, result.value.nextCursor)
                    }
                    is ApiResult.Failure -> loadMoreFailed = true
                }
                loadingMore = false
            }
        }
    }

    Box(modifier = modifier.fillMaxSize()) {
        when (val shown = state) {
            null -> FeedSkeleton()
            CommunityFeedUiState.Empty -> EmptyFeed()
            is CommunityFeedUiState.Unavailable ->
                Unavailable(
                    offline = shown.offline,
                    onRetry = { attempts += 1 },
                )
            is CommunityFeedUiState.Snapshot ->
                Feed(
                    posts = shown.posts,
                    stale = true,
                    nextCursor = null,
                    loadingMore = loadingMore,
                    loadMoreFailed = loadMoreFailed,
                    onLoadMore = loadMore,
                    onRetryPage = { attempts += 1 },
                    onOpenPost = onOpenPost,
                    onOpenProfile = onOpenProfile,
                    canEdit = ::canEdit,
                    onEditPost = { editing = it },
                )
            is CommunityFeedUiState.Live ->
                Feed(
                    posts = shown.posts,
                    stale = false,
                    nextCursor = shown.nextCursor,
                    loadingMore = loadingMore,
                    loadMoreFailed = loadMoreFailed,
                    onLoadMore = loadMore,
                    onRetryPage = { attempts += 1 },
                    onOpenPost = onOpenPost,
                    onOpenProfile = onOpenProfile,
                    canEdit = ::canEdit,
                    onEditPost = { editing = it },
                )
        }
    }

    // The editor is a state of the feed rather than a route (#925): the page
    // opens it as a dialog on the post it belongs to. A save repaints the card
    // from the draft, so the feed shows what the server now holds without a read.
    val store = editorStore
    val target = editing
    if (store != null && target != null) {
        CommunityEditor(
            post = target,
            store = store,
            signedIn = signedIn,
            onDismiss = { draft ->
                editing = null
                val current = state
                if (draft != null && current != null) {
                    state = current.withBody(draft.id, draft.body)
                }
            },
        )
    }
}

/** The cards, the snapshot banner over them, and the control that pages them. */
@Composable
private fun Feed(
    posts: List<CommunityIndexResponsePostsItem>,
    stale: Boolean,
    nextCursor: String?,
    loadingMore: Boolean,
    loadMoreFailed: Boolean,
    onLoadMore: () -> Unit,
    onRetryPage: () -> Unit,
    onOpenPost: (String) -> Unit,
    onOpenProfile: (String) -> Unit,
    canEdit: (CommunityIndexResponsePostsItem) -> Boolean,
    onEditPost: (CommunityIndexResponsePostsItem) -> Unit,
) {
    val spacing = LocalRoySpacing.current

    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding =
            PaddingValues(
                // The page's feed sits inside two containers (`main` and the page's
                // own `max-w-7xl`), so its column is 32px in from the viewport at
                // 393 rather than the shell's usual 16. The app draws no outer
                // container, so the card keeps the page's width by taking both.
                horizontal = spacing.containerPadding * 2,
                vertical = spacing.elementGapSm,
            ),
        verticalArrangement = Arrangement.spacedBy(spacing.elementGap),
    ) {
        if (stale) {
            item {
                NeedsConnection(
                    message = CommunityFeedCopy.STALE_MESSAGE,
                    state = NeedsConnectionState.Inline,
                    onRetry = onRetryPage,
                )
            }
        }

        items(posts, key = { it.id }) { post ->
            PostCard(
                post = post,
                onOpen = { onOpenPost(post.slug) },
                onOpenAuthor = onOpenProfile,
                onEdit = if (canEdit(post)) {
                    { onEditPost(post) }
                } else {
                    null
                },
            )
        }

        if (nextCursor != null) {
            item {
                if (loadMoreFailed) {
                    ReadFailureNotice(
                        message = CommunityFeedCopy.LOAD_MORE_ERROR,
                        state = ReadFailureState.FailedInline,
                        onRetry = onLoadMore,
                    )
                } else {
                    LoadMore(loading = loadingMore, onLoadMore = onLoadMore)
                }
            }
        }
    }
}

/**
 * The page's `LoadMore` control: a centred pill, `h-11 px-8 text-sm font-bold`,
 * with the same words from the same copy source.
 *
 * It is not a Material button: the page's anchor is a pill with a 1px border and
 * a translucent muted fill, and the gate measures the box rather than trusting a
 * lookalike. The label is a button label, so the page's `aria-label` sentence is
 * the app's content description.
 */
@Composable
private fun LoadMore(loading: Boolean, onLoadMore: () -> Unit) {
    val type = LocalRoyTypeScale.current

    Row(
        modifier =
            Modifier.fillMaxWidth().testTag(CommunityFeedMetrics.LOAD_MORE_REGION),
        horizontalArrangement = Arrangement.Center,
    ) {
        Box(
            modifier =
                Modifier.height(CommunityFeedMetrics.LOAD_MORE_HEIGHT.dp)
                    .clip(CircleShape)
                    .background(RoyColors.muted.copy(alpha = 0.3f))
                    .border(1.dp, RoyColors.border, CircleShape)
                    .clickable(enabled = !loading, onClick = onLoadMore)
                    .padding(horizontal = CommunityFeedMetrics.LOAD_MORE_PADDING.dp)
                    .testTag(CommunityFeedMetrics.LOAD_MORE)
                    .semantics {
                        role = Role.Button
                        contentDescription = CommunityFeedCopy.LOAD_MORE_ARIA
                    },
            contentAlignment = Alignment.Center,
        ) {
            Text(
                text = if (loading) CommunityFeedCopy.LOADING else CommunityFeedCopy.LOAD_MORE,
                style = type.small.copy(fontWeight = FontWeight.Bold),
                color = RoyColors.foreground,
            )
        }
    }
}

/**
 * The page's empty state: its glyph, its title and its sentence.
 *
 * The search result's variant ("no results for that query") is not here: the app
 * has no search control yet, so the only empty feed it can be showing is the
 * feed that has no posts.
 */
@Composable
private fun EmptyFeed() {
    val type = LocalRoyTypeScale.current
    val spacing = LocalRoySpacing.current

    Column(
        modifier = Modifier.fillMaxSize().padding(spacing.containerPadding * 2),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
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
            text = CommunityFeedCopy.EMPTY_TITLE,
            style = type.h2.copy(fontWeight = FontWeight.Bold),
            color = RoyColors.foreground,
            textAlign = TextAlign.Center,
            modifier = Modifier.padding(top = spacing.elementGap),
        )
        Text(
            text = CommunityFeedCopy.EMPTY_BODY,
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

/** The site's skeleton: one cover block and the two lines under it, per card. */
@Composable
private fun FeedSkeleton() {
    val spacing = LocalRoySpacing.current

    Column(
        modifier =
            Modifier.fillMaxSize()
                .padding(
                    horizontal = spacing.containerPadding * 2,
                    vertical = spacing.elementGapSm,
                ),
        verticalArrangement = Arrangement.spacedBy(spacing.elementGap),
    ) {
        repeat(2) {
            Box(
                modifier =
                    Modifier.fillMaxWidth()
                        .height(180.dp)
                        .background(Recipes.Skeleton.fill.copy(alpha = 0.5f), Recipes.Skeleton.radius),
            )
        }
    }
}

/**
 * The feed after the owner saved [body] (#925): the card paints what the server
 * now holds, without a read that would need the radio.
 */
private fun CommunityFeedUiState.withBody(id: String, body: String): CommunityFeedUiState {
    val metaDesc = PostText.stripMarkdown(body).take(160)
    fun List<CommunityIndexResponsePostsItem>.edited() =
        map { post -> if (post.id == id) post.copy(content = body, meta_desc = metaDesc) else post }
    return when (this) {
        is CommunityFeedUiState.Live -> copy(posts = posts.edited())
        is CommunityFeedUiState.Snapshot -> copy(posts = posts.edited())
        else -> this
    }
}
