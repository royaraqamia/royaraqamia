package com.royaraqamia.app.news

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import com.royaraqamia.app.contracts.generated.NewsBoardResponseBoard
import com.royaraqamia.app.contracts.generated.NewsBoardResponseBoardCards
import com.royaraqamia.app.contracts.generated.NewsBoardResponseBoardPersonal
import com.royaraqamia.app.shared.NeedsConnection
import com.royaraqamia.app.shared.NeedsConnectionState
import com.royaraqamia.app.shared.ReadFailureNotice
import com.royaraqamia.app.shared.ReadFailureState
import com.royaraqamia.app.theme.LocalRoySpacing
import com.royaraqamia.app.theme.LocalRoyTypeScale
import com.royaraqamia.app.theme.Recipes
import com.royaraqamia.app.theme.RoyColors

/** The visual gate's handles on the digest (#926, `shared/visual/news.json`). */
object NewsDigestMetrics {
    const val TITLE = "news-title"
    const val ARCHIVE = "news-archive"
    const val STORY = "news-story"
    const val STORY_SOURCE = "news-story-source"
    const val EMPTY = "news-empty"
    const val CARDS = "news-cards"
    const val STALE = "news-stale"
    const val PERSONAL = "news-personal"
    const val UNAVAILABLE = "news-unavailable"

    /** The page's own box for the title, recorded at 393 CSS px (#1345). */
    val TITLE_HEIGHT = 46.5.dp
    val TITLE_SIZE = 30.sp
    val TITLE_LINE_HEIGHT = 37.5.sp
    val TITLE_WEIGHT = FontWeight(800)

    /** The story card's numbers, read from `frontend/ui/news/StoryCard.tsx`. */
    val STORY_RADIUS = 16.dp
    val STORY_PADDING = 20.dp
    /** The page's 20, the 1px border Compose paints without consuming, and the two
     *  pixels Compose's line boxes lose against the page's three text rows. */
    val STORY_CONTENT_PADDING = 23.dp
    val STORY_HEADER_HEIGHT = 26.5.dp
    val STORY_HEADLINE_SIZE = 18.sp
    val STORY_HEADLINE_LINE_HEIGHT = 24.75.sp
    val STORY_SUMMARY_SIZE = 14.sp
    val STORY_SUMMARY_LINE_HEIGHT = 28.sp
    val STORY_META_SIZE = 11.sp
    val STORY_META_LINE_HEIGHT = 16.5.sp
    val STORY_SOURCE_PADDING = 8.dp

    /** The day strip: the page's chip and its 4px bottom breathing room. */
    val ARCHIVE_CHIP_LINE_HEIGHT = 16.sp
    val ARCHIVE_PADDING_BOTTOM = 4.dp
}

/**
 * The site's `/news` as a screen (#926).
 *
 * The page's digest and its one visible filter: the title, the day strip, the
 * story cards and the plan's card allowance, plus the two faces the page has for
 * a reader's own sources. Search is the page's own combobox and is not part of
 * this slice; the digest never needs a query to answer.
 *
 * The personal digest is the same read with `view=mine` (the route's default)
 * and the shared one with `view=public`. A signed-in reader whose own digest
 * exists sees the badge and the switch, exactly as the page draws them; a reader
 * who has one is never shown the shared digest without being told.
 *
 * Offline is the shared public-surface rule (`docs/specs/offline-first.md`): the
 * last board this device saw for the same day and view is painted under the
 * needs-connection line, filters disabled, and the retry is the only control.
 * With nothing kept, the same named state is the whole screen — or the
 * read-failure state when the server refused rather than being unreachable
 * (ADR-0031).
 *
 * It is switched on: the layout contract and the raster were recorded against
 * the page at 393 x 852 @ 2.75, so the shell draws this screen for `/news`
 * (#1345, ADR-0118).
 */
@Composable
fun NewsDigestScreen(
    repository: NewsDigestRepository,
    modifier: Modifier = Modifier,
    onOpenUrl: (String) -> Unit = {},
    onSignIn: () -> Unit = {},
    onSeePlans: () -> Unit = {},
    onManageSources: () -> Unit = {},
) {
    var state by remember { mutableStateOf<NewsDigestUiState?>(null) }
    var attempts by remember { mutableIntStateOf(0) }
    var date by remember { mutableStateOf<String?>(null) }
    var view by remember { mutableStateOf(NewsDigestRepository.VIEW_MINE) }

    LaunchedEffect(repository, attempts, date, view) {
        state = null
        state = NewsDigestUiState.of(repository.board(date, view))
    }

    NewsDigestContent(
        state = state,
        date = date,
        onSelectDate = { date = it },
        onToggleView = {
            view =
                if (view == NewsDigestRepository.VIEW_PUBLIC) {
                    NewsDigestRepository.VIEW_MINE
                } else {
                    NewsDigestRepository.VIEW_PUBLIC
                }
        },
        onRetry = { attempts += 1 },
        onOpenUrl = onOpenUrl,
        onSignIn = onSignIn,
        onSeePlans = onSeePlans,
        onManageSources = onManageSources,
        modifier = modifier,
    )
}

/** The screen over a state the caller already decided, so a test can draw each face. */
@Composable
internal fun NewsDigestScreen(
    state: NewsDigestUiState?,
    date: String? = null,
    onSelectDate: (String?) -> Unit = {},
    onToggleView: () -> Unit = {},
    onRetry: () -> Unit = {},
    onOpenUrl: (String) -> Unit = {},
    onSignIn: () -> Unit = {},
    onSeePlans: () -> Unit = {},
    onManageSources: () -> Unit = {},
    modifier: Modifier = Modifier,
) {
    NewsDigestContent(
        state = state,
        date = date,
        onSelectDate = onSelectDate,
        onToggleView = onToggleView,
        onRetry = onRetry,
        onOpenUrl = onOpenUrl,
        onSignIn = onSignIn,
        onSeePlans = onSeePlans,
        onManageSources = onManageSources,
        modifier = modifier,
    )
}

@Composable
private fun NewsDigestContent(
    state: NewsDigestUiState?,
    date: String?,
    onSelectDate: (String?) -> Unit,
    onToggleView: () -> Unit,
    onRetry: () -> Unit,
    onOpenUrl: (String) -> Unit,
    onSignIn: () -> Unit,
    onSeePlans: () -> Unit,
    onManageSources: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val type = LocalRoyTypeScale.current
    val spacing = LocalRoySpacing.current

    Column(
        modifier =
            modifier
                .fillMaxSize()
                .background(RoyColors.background)
                .verticalScroll(rememberScrollState())
                .padding(horizontal = spacing.containerPadding)
                .padding(vertical = spacing.elementGapSm),
        verticalArrangement = Arrangement.spacedBy(spacing.elementGap),
    ) {
        Box(
            modifier =
                Modifier.fillMaxWidth()
                    .height(NewsDigestMetrics.TITLE_HEIGHT)
                    .testTag(NewsDigestMetrics.TITLE)
                    .semantics { contentDescription = NewsPageCopy.PAGE_TITLE },
            contentAlignment = Alignment.Center,
        ) {
            Text(
                text = NewsPageCopy.PAGE_TITLE,
                style =
                    type.h2.copy(
                        fontSize = NewsDigestMetrics.TITLE_SIZE,
                        fontWeight = NewsDigestMetrics.TITLE_WEIGHT,
                        lineHeight = NewsDigestMetrics.TITLE_LINE_HEIGHT,
                        letterSpacing = (-0.025f).em,
                    ),
                color = RoyColors.primary,
                textAlign = TextAlign.Center,
            )
        }

        when (state) {
            null -> Loading()
            is NewsDigestUiState.Unavailable ->
                Unavailable(offline = state.offline, onRetry = onRetry)
            is NewsDigestUiState.Snapshot ->
                Body(
                    board = state.board,
                    stale = true,
                    date = date,
                    onSelectDate = onSelectDate,
                    onToggleView = onToggleView,
                    onRetry = onRetry,
                    onOpenUrl = onOpenUrl,
                    onSignIn = onSignIn,
                    onSeePlans = onSeePlans,
                    onManageSources = onManageSources,
                )
            is NewsDigestUiState.Live ->
                Body(
                    board = state.board,
                    stale = false,
                    date = date,
                    onSelectDate = onSelectDate,
                    onToggleView = onToggleView,
                    onRetry = onRetry,
                    onOpenUrl = onOpenUrl,
                    onSignIn = onSignIn,
                    onSeePlans = onSeePlans,
                    onManageSources = onManageSources,
                )
        }
    }
}

/** The saved-copy banner, the personal switch, the day strip, the stories, the allowance. */
@Composable
private fun Body(
    board: NewsBoardResponseBoard,
    stale: Boolean,
    date: String?,
    onSelectDate: (String?) -> Unit,
    onToggleView: () -> Unit,
    onRetry: () -> Unit,
    onOpenUrl: (String) -> Unit,
    onSignIn: () -> Unit,
    onSeePlans: () -> Unit,
    onManageSources: () -> Unit,
) {
    if (stale) {
        Box(modifier = Modifier.testTag(NewsDigestMetrics.STALE)) {
            NeedsConnection(
                message = NewsDigestCopy.STALE_MESSAGE,
                state = NeedsConnectionState.Inline,
                onRetry = onRetry,
            )
        }
    }

    PersonalBanner(
        personal = board.personal,
        stale = stale,
        onToggleView = onToggleView,
        onManageSources = onManageSources,
    )

    if (board.search == null && board.dates.isNotEmpty()) {
        NewsArchiveRow(
            dates = board.dates,
            selected = date,
            enabled = !stale,
            onSelect = onSelectDate,
        )
    }

    val day = board.day
    val search = board.search
    when {
        search != null -> StoryColumn(search.hits.map { it.toView() }, onOpenUrl)
        day != null && day.stories.isNotEmpty() ->
            StoryColumn(
                stories = day.stories.map { it.toView() },
                onOpenUrl = onOpenUrl,
                // The page's `mt-8` on the stories block, over the column's own
                // 16 gap: the story card sits 32 below the day strip (#1345).
                modifier = Modifier.padding(top = 16.dp),
            )
        day != null ->
            Notice(text = NewsDigestCopy.CATEGORY_EMPTY, tag = NewsDigestMetrics.EMPTY)
        else -> EmptyDay(board.hasAnyDigest, onSelectDate)
    }

    board.cards?.let { cards ->
        CardsNotice(
            cards = cards,
            onSignIn = onSignIn,
            onSeePlans = onSeePlans,
        )
    }
}

@Composable
private fun StoryColumn(
    stories: List<NewsStoryView>,
    onOpenUrl: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    val spacing = LocalRoySpacing.current

    Column(
        modifier = modifier.fillMaxWidth(),
        verticalArrangement = Arrangement.spacedBy(spacing.elementGap),
    ) {
        for (story in stories) {
            NewsStoryCard(story = story, onOpenUrl = onOpenUrl)
        }
    }
}

/** The page's badge and the link to the other digest, when the reader has one. */
@Composable
private fun PersonalBanner(
    personal: NewsBoardResponseBoardPersonal?,
    stale: Boolean,
    onToggleView: () -> Unit,
    onManageSources: () -> Unit,
) {
    val type = LocalRoyTypeScale.current

    if (personal != null && (personal.active || personal.available)) {
        Row(
            modifier = Modifier.fillMaxWidth().testTag(NewsDigestMetrics.PERSONAL),
            horizontalArrangement = Arrangement.spacedBy(12.dp, Alignment.CenterHorizontally),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            if (personal.active) {
                Text(
                    text = NewsDigestCopy.PERSONAL_ACTIVE,
                    style = type.xs.copy(fontWeight = FontWeight.Bold),
                    color = RoyColors.primary,
                )
            }
            Link(
                text =
                    if (personal.active) {
                        NewsDigestCopy.SHOW_PUBLIC
                    } else {
                        NewsDigestCopy.PERSONAL_AVAILABLE
                    },
                enabled = !stale,
                onClick = onToggleView,
            )
        }
    }

    if (personal?.ownSources != null && personal.ownSources.contributed == 0L) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(8.dp, Alignment.CenterHorizontally),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                text = NewsDigestCopy.OWN_SOURCES_EMPTY,
                style = type.xs,
                color = RoyColors.mutedForeground,
            )
            Link(
                text = NewsDigestCopy.MANAGE_SOURCES,
                enabled = true,
                onClick = onManageSources,
            )
        }
    }
}

/** The page's empty day: which kind of empty it is, and the way to the latest digest. */
@Composable
private fun EmptyDay(hasAnyDigest: Boolean, onSelectDate: (String?) -> Unit) {
    val type = LocalRoyTypeScale.current
    val spacing = LocalRoySpacing.current
    val shape = RoundedCornerShape(24.dp)

    Column(
        modifier =
            Modifier.fillMaxWidth()
                .testTag(NewsDigestMetrics.EMPTY)
                .background(RoyColors.card.copy(alpha = 0.85f), shape)
                .border(1.dp, RoyColors.border.copy(alpha = 0.6f), shape)
                .padding(spacing.cardPadding),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(spacing.elementGapSm),
    ) {
        Text(
            text = NewsDigestCopy.EMPTY_TITLE,
            style = type.h3.copy(fontWeight = FontWeight.ExtraBold),
            color = RoyColors.foreground,
            textAlign = TextAlign.Center,
        )
        Text(
            text =
                if (hasAnyDigest) {
                    NewsDigestCopy.EMPTY_RETENTION.replace("{days}", RETENTION_DAYS.toString())
                } else {
                    NewsDigestCopy.EMPTY_FIRST
                },
            style = type.small,
            color = RoyColors.mutedForeground,
            textAlign = TextAlign.Center,
        )
        if (hasAnyDigest) {
            Link(
                text = NewsDigestCopy.LATEST_DIGEST,
                enabled = true,
                onClick = { onSelectDate(null) },
            )
        }
    }
}

/** How many days a digest survives; the board's own dates stop at the same window. */
private const val RETENTION_DAYS = 7

/** The plan's card allowance, worded for a visitor or for a member. */
@Composable
private fun CardsNotice(
    cards: NewsBoardResponseBoardCards,
    onSignIn: () -> Unit,
    onSeePlans: () -> Unit,
) {
    val type = LocalRoyTypeScale.current
    val spacing = LocalRoySpacing.current
    val shape = RoundedCornerShape(16.dp)

    val message =
        if (cards.visitor) {
            NewsDigestCopy.CARDS_VISITOR
        } else {
            NewsDigestCopy.CARDS_MEMBER
        }
            .replace("{shown}", NewsFormat.count(cards.shown))
            .replace("{total}", NewsFormat.count(cards.total))

    Column(
        modifier =
            Modifier.fillMaxWidth()
                .testTag(NewsDigestMetrics.CARDS)
                .background(RoyColors.primary.copy(alpha = 0.05f), shape)
                .border(1.dp, RoyColors.primary.copy(alpha = 0.3f), shape)
                .padding(spacing.elementGapSm),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(spacing.elementGapSm),
    ) {
        Text(
            text = message,
            style = type.small,
            color = RoyColors.mutedForeground,
            textAlign = TextAlign.Center,
        )
        Link(
            text = if (cards.visitor) NewsDigestCopy.SIGN_IN else NewsDigestCopy.SEE_PLANS,
            enabled = true,
            onClick = if (cards.visitor) onSignIn else onSeePlans,
        )
    }
}

/** Nothing to show: an unreachable server, or one that refused the read. */
@Composable
private fun Unavailable(offline: Boolean, onRetry: () -> Unit) {
    Column(
        modifier = Modifier.fillMaxWidth().testTag(NewsDigestMetrics.UNAVAILABLE),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(LocalRoySpacing.current.elementGapSm),
    ) {
        if (offline) {
            NeedsConnection(
                message = NewsDigestCopy.PAGE_ERROR,
                state = NeedsConnectionState.Block,
                onRetry = onRetry,
            )
        } else {
            ReadFailureNotice(
                message = NewsDigestCopy.PAGE_ERROR,
                state = ReadFailureState.Failed,
                onRetry = onRetry,
            )
        }
    }
}

/** The site's skeleton, for the moment before the read answers. */
@Composable
private fun Loading() {
    Column(
        modifier = Modifier.fillMaxWidth(),
        verticalArrangement = Arrangement.spacedBy(Recipes.Skeleton.gap),
    ) {
        for (height in Recipes.Skeleton.blocks) {
            Box(
                modifier =
                    Modifier.fillMaxWidth()
                        .height(height)
                        .background(Recipes.Skeleton.fill.copy(alpha = 0.5f), Recipes.Skeleton.radius),
            )
        }
    }
}

/** A sentence where the page draws one, and nothing interactive beyond the retry. */
@Composable
private fun Notice(text: String, tag: String) {
    val type = LocalRoyTypeScale.current
    val shape = RoundedCornerShape(16.dp)

    Text(
        text = text,
        modifier =
            Modifier.fillMaxWidth()
                .testTag(tag)
                .background(RoyColors.card.copy(alpha = 0.85f), shape)
                .border(1.dp, RoyColors.border.copy(alpha = 0.6f), shape)
                .padding(LocalRoySpacing.current.cardPadding),
        style = type.small,
        color = RoyColors.mutedForeground,
        textAlign = TextAlign.Center,
    )
}

/** The page's text link: a control, a label, and a disabled state while a snapshot is shown. */
@Composable
private fun Link(text: String, enabled: Boolean, onClick: () -> Unit) {
    val type = LocalRoyTypeScale.current

    Text(
        text = text,
        modifier =
            Modifier.clickable(enabled = enabled, role = Role.Button, onClick = onClick)
                .padding(horizontal = 4.dp, vertical = 2.dp),
        style = type.xs.copy(fontWeight = FontWeight.Bold),
        color = if (enabled) RoyColors.primary else RoyColors.mutedForeground,
    )
}
