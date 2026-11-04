package com.royaraqamia.app.account

import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
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
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import com.royaraqamia.app.contracts.ApiResult
import com.royaraqamia.app.shell.digitRunsOf
import com.royaraqamia.app.theme.Recipes
import com.royaraqamia.app.theme.RoyColors
import com.royaraqamia.app.theme.RoyFonts
import com.royaraqamia.app.theme.RoyShape

/**
 * The Android changelog, as the site's `/account/changelog` draws it (#951).
 *
 * The second client of `frontend/ui/account/changelog-view.tsx`, not a second
 * design: the same title, the same release cards, the same bullet notes and the
 * same empty sentence, all from `shared/copy/account-changelog.json` (ADR-0098).
 * `docs/mobile/parity.json` lists the pair and `npm run check:parity` fails a
 * state or a string that exists on one side only.
 *
 * The read is the page's own file (`public/android/changelog.json`), so a release
 * the weekly train publishes is on both clients without a second list to keep in
 * step. A release with no notes is dropped by the repository, which is the
 * page's rule too: an empty card is not a release.
 */
@Composable
fun ChangelogScreen(repository: ChangelogRepository, modifier: Modifier = Modifier) {
    var state by remember { mutableStateOf<ChangelogUiState>(ChangelogUiState.Loading) }

    LaunchedEffect(repository) {
        state =
            when (val result = repository.releases()) {
                is ApiResult.Success -> ChangelogUiState.Ready(result.value)
                // The page's reader answers a failed fetch with an empty list, so a
                // phone with no radio draws the same sentence a browser would.
                is ApiResult.Failure -> ChangelogUiState.Ready(emptyList())
            }
    }

    ChangelogContent(state, modifier)
}

/**
 * The screen over the state, so a test or the future gate can draw it without a
 * client (#951): the read lives in [ChangelogScreen], not here.
 */
@Composable
internal fun ChangelogContent(state: ChangelogUiState, modifier: Modifier = Modifier) {
    Column(
        modifier =
            modifier
                .fillMaxSize()
                .background(RoyColors.background)
                .verticalScroll(rememberScrollState())
                .padding(horizontal = ChangelogMetrics.horizontalPadding)
                .padding(top = ChangelogMetrics.topPadding),
        verticalArrangement = Arrangement.spacedBy(ChangelogMetrics.titleToList),
    ) {
        Text(
            text = digitRuns(ChangelogCopy.PAGE_TITLE),
            modifier =
                Modifier.fillMaxWidth()
                    .height(ChangelogMetrics.titleHeight)
                    .testTag(ChangelogMetrics.TITLE)
                    .semantics { heading() },
            style =
                TextStyle(
                    fontSize = ChangelogMetrics.titleSize,
                    lineHeight = ChangelogMetrics.titleLineHeight,
                    fontWeight = ChangelogMetrics.titleWeight,
                    letterSpacing = ChangelogMetrics.titleTracking,
                    textAlign = TextAlign.Center,
                    brush =
                        Brush.horizontalGradient(
                            listOf(
                                ChangelogMetrics.titleStart,
                                ChangelogMetrics.titleMiddle,
                                ChangelogMetrics.titleEnd,
                            )
                        ),
                ),
        )

        when (state) {
            ChangelogUiState.Loading -> Loading()
            is ChangelogUiState.Ready ->
                if (state.releases.isEmpty()) Empty() else Releases(state.releases)
        }
    }
}

/** The site's skeleton: two cards' worth of blocks, pulsing while the file is out. */
@Composable
private fun Loading() {
    val transition = rememberInfiniteTransition(label = "changelog-skeleton")
    val alpha by
        transition.animateFloat(
            initialValue = Recipes.Skeleton.pulseFrom,
            targetValue = Recipes.Skeleton.pulseTo,
            animationSpec = infiniteRepeatable(tween(Recipes.Skeleton.pulseMs), RepeatMode.Reverse),
            label = "changelog-skeleton-alpha",
        )

    Column(
        modifier =
            Modifier.fillMaxWidth()
                .testTag(ChangelogMetrics.LOADING)
                .semantics {
                    // The page labels its skeleton with the same sentence, so a
                    // screen reader announces the state rather than two boxes.
                    contentDescription = ChangelogCopy.LOADING_LABEL
                },
        verticalArrangement = Arrangement.spacedBy(ChangelogMetrics.loadingGap),
    ) {
        repeat(2) {
            Box(
                modifier =
                    Modifier.fillMaxWidth()
                        .height(ChangelogMetrics.loadingBlockHeight)
                        .clip(RoyShape.card)
                        .background(RoyColors.muted.copy(alpha = 0.4f * alpha))
                        .border(
                            ChangelogMetrics.borderWidth,
                            RoyColors.border.copy(alpha = 0.4f),
                            RoyShape.card,
                        )
            )
        }
    }
}

/** The page's own sentence for a file with nothing to show. */
@Composable
private fun Empty() {
    Box(
        modifier =
            Modifier.fillMaxWidth()
                .testTag(ChangelogMetrics.EMPTY)
                .clip(RoyShape.card)
                .background(RoyColors.card.copy(alpha = 0.6f))
                .border(
                    ChangelogMetrics.borderWidth,
                    RoyColors.border.copy(alpha = 0.5f),
                    RoyShape.card,
                )
                .padding(ChangelogMetrics.emptyPadding),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text = digitRuns(ChangelogCopy.EMPTY),
            style = ChangelogMetrics.emptyStyle,
            color = RoyColors.mutedForeground,
            textAlign = TextAlign.Center,
        )
    }
}

/** The list, newest first, one card per release. */
@Composable
private fun Releases(releases: List<ChangelogRelease>) {
    Column(
        modifier = Modifier.fillMaxWidth().testTag(ChangelogMetrics.LIST),
        verticalArrangement = Arrangement.spacedBy(ChangelogMetrics.releaseGap),
    ) {
        releases.forEachIndexed { index, release -> ReleaseCard(release, index) }
    }
}

/** One release: its version and date, then its notes as the page's bullet list. */
@Composable
private fun ReleaseCard(release: ChangelogRelease, index: Int) {
    Column(
        modifier =
            Modifier.fillMaxWidth()
                .testTag(ChangelogMetrics.releaseTag(index))
                .clip(RoyShape.card)
                .background(RoyColors.card.copy(alpha = 0.6f))
                .border(
                    ChangelogMetrics.borderWidth,
                    RoyColors.border.copy(alpha = 0.5f),
                    RoyShape.card,
                )
                .padding(ChangelogMetrics.releasePadding),
        verticalArrangement = Arrangement.spacedBy(ChangelogMetrics.releaseInnerGap),
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.Top,
        ) {
            Text(
                text =
                    digitRuns(
                        ChangelogCopy.RELEASE_TITLE.replace("{version}", release.version)
                    ),
                modifier =
                    Modifier.weight(1f)
                        .testTag(ChangelogMetrics.releaseTitleTag(index))
                        .semantics { heading() },
                style = ChangelogMetrics.releaseTitleStyle,
                color = RoyColors.foreground,
            )
            if (release.releasedAt.isNotEmpty()) {
                Text(
                    text = digitRuns(release.releasedAt),
                    style = ChangelogMetrics.dateStyle,
                    color = RoyColors.mutedForeground,
                )
            }
        }

        Column(
            modifier =
                Modifier.fillMaxWidth().testTag(ChangelogMetrics.notesTag(index)),
            verticalArrangement = Arrangement.spacedBy(ChangelogMetrics.noteGap),
        ) {
            release.notes.forEachIndexed { noteIndex, note ->
                Row(
                    modifier =
                        Modifier.fillMaxWidth()
                            .testTag(ChangelogMetrics.noteTag(index, noteIndex)),
                    horizontalArrangement = Arrangement.spacedBy(ChangelogMetrics.bulletGap),
                    verticalAlignment = Alignment.Top,
                ) {
                    Text(
                        text = ChangelogMetrics.BULLET,
                        // The site's list marker is CSS, so a screen reader never
                        // announces it; clear it here rather than reading "bullet".
                        modifier = Modifier.clearAndSetSemantics {},
                        style = ChangelogMetrics.noteStyle,
                        color = RoyColors.foreground.copy(alpha = 0.9f),
                    )
                    Text(
                        text = digitRuns(note),
                        modifier = Modifier.weight(1f),
                        style = ChangelogMetrics.noteStyle,
                        color = RoyColors.foreground.copy(alpha = 0.9f),
                    )
                }
            }
        }
    }
}

/**
 * [text] with every numeric run in the read-only digit face.
 *
 * The site's `--font-sans` is `var(--font-digits), var(--font-arabic)`, so its
 * numbers render in Aref Ruqaa through a `unicode-range`; Compose has no
 * `unicode-range`, so the runs are styled explicitly (ADR-0054). A version line
 * and a date are both runs, and the notes may carry one.
 */
@Composable
private fun digitRuns(text: String): AnnotatedString = remember(text) {
    buildAnnotatedString {
        var last = 0
        for (run in digitRunsOf(text)) {
            append(text.substring(last, run.first))
            withStyle(SpanStyle(fontFamily = RoyFonts.digits, fontWeight = FontWeight.Normal)) {
                append(text.substring(run.first, run.last + 1))
            }
            last = run.last + 1
        }
        append(text.substring(last))
    }
}

/** The page's numbers, in the units both clients measure at 393 x 852. */
internal object ChangelogMetrics {
    const val TITLE = "changelog-title"
    const val LIST = "changelog-list"
    const val LOADING = "changelog-loading"
    const val EMPTY = "changelog-empty"
    const val BULLET = "•"

    fun releaseTag(index: Int): String = "changelog-release-$index"
    fun releaseTitleTag(index: Int): String = "changelog-release-title-$index"
    fun notesTag(index: Int): String = "changelog-notes-$index"
    fun noteTag(index: Int, note: Int): String = "changelog-note-$index-$note"

    val horizontalPadding = 16.dp
    val topPadding = 24.dp
    val titleToList = 40.dp

    val titleSize = 30.sp
    val titleLineHeight = 46.5.sp
    val titleHeight = 46.5.dp
    val titleWeight = FontWeight.ExtraBold
    val titleTracking = (-0.025).em
    val titleStart = Color(0xFFA684FF)
    val titleMiddle = Color(0xFFED6AFF)
    val titleEnd = Color(0xFF7C86FF)

    val borderWidth = 1.dp
    val releaseGap = 16.dp
    val releasePadding = 16.dp
    val releaseInnerGap = 8.dp
    val noteGap = 6.dp
    val bulletGap = 6.dp
    val emptyPadding = 20.dp
    val loadingGap = 12.dp
    val loadingBlockHeight = 96.dp

    val releaseTitleStyle =
        TextStyle(fontSize = 14.sp, lineHeight = 20.sp, fontWeight = FontWeight.Bold)
    val dateStyle = TextStyle(fontSize = 11.sp, lineHeight = 16.sp)
    val noteStyle = TextStyle(fontSize = 12.sp, lineHeight = 19.5.sp)
    val emptyStyle = TextStyle(fontSize = 14.sp, lineHeight = 22.75.sp)
}
