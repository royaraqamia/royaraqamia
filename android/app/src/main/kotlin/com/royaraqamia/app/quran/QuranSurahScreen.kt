package com.royaraqamia.app.quran

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.InlineTextContent
import androidx.compose.foundation.text.appendInlineContent
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
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
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.layout.positionInParent
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.Placeholder
import androidx.compose.ui.text.PlaceholderVerticalAlign
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import com.royaraqamia.app.theme.RoyColors
import com.royaraqamia.app.theme.RoyFonts
import kotlinx.coroutines.delay

/**
 * One sura, as the site's `/quran/[surah]` draws it (#955).
 *
 * The text is the vendored Uthmani copy, set in the vendored face; the printed
 * Mushaf's page, juz, hizb and sajdah marks are labels above the Ayah that opens
 * them, and each Ayah closes with its number in the Mushaf's rosette. The screen
 * reads no network at all, so a sura opens with the radio off.
 *
 * Where the reader stops is written to the device once the scroll settles, and a
 * sura opened again is scrolled back to it: the position survives the process
 * because it is a preference, not a field in this composition.
 */
@Composable
fun QuranSurahScreen(
    surah: QuranSurah,
    summary: QuranSurahSummary,
    marks: Map<Int, QuranAyahMarks>,
    position: QuranReadingPosition?,
    onSavePosition: (ayah: Int) -> Unit,
    modifier: Modifier = Modifier,
    face: QuranPlayerFace = QuranPlayerFace.Idle,
    saved: QuranPlayerSaved = QuranPlayerSaved(),
    onPlay: () -> Unit = {},
    onToggle: () -> Unit = {},
    onStop: () -> Unit = {},
    onRemove: () -> Unit = {},
) {
    val scroll = rememberScrollState()
    var cardTops by remember { mutableStateOf<Map<Int, Float>>(emptyMap()) }
    var restored by remember(surah.n, position?.ayah) { mutableStateOf(false) }

    BoxWithConstraints(modifier = modifier.fillMaxSize()) {
        val viewportHeight = with(LocalDensity.current) { maxHeight.toPx() }

        fun currentAyah(): Int {
            if (cardTops.isEmpty()) return 1
            val line = scroll.value + viewportHeight * 0.15f
            return cardTops.filter { it.value <= line }.maxByOrNull { it.value }?.key ?: 1
        }

        LaunchedEffect(scroll.value, cardTops) {
            if (cardTops.isEmpty()) return@LaunchedEffect
            delay(POSITION_WRITE_DELAY_MS)
            onSavePosition(currentAyah())
        }

        LaunchedEffect(cardTops, position) {
            if (restored) return@LaunchedEffect
            val target = position?.takeIf { it.surah == surah.n }?.ayah ?: return@LaunchedEffect
            val top = cardTops[target] ?: return@LaunchedEffect
            // Put the Ayah on the reading line, not at the very top: the
            // position that is written next is the Ayah crossing that line, so
            // opening a sura again cannot drift forward one Ayah at a time.
            scroll.scrollTo((top - viewportHeight * 0.15f).toInt().coerceAtLeast(0))
            restored = true
        }

        Column(
            modifier =
                Modifier.fillMaxSize()
                    .verticalScroll(scroll)
                    .padding(horizontal = QuranSurahMetrics.horizontalPadding)
                    .padding(
                        top = QuranSurahMetrics.topPadding,
                        bottom = QuranSurahMetrics.bottomPadding + QuranSurahMetrics.playerClearance,
                    ),
        ) {
            SurahHeader(summary = summary)

            if (surah.bismillah != null) {
                Text(
                    text = QuranFonts.annotated(surah.bismillah),
                    modifier =
                        Modifier.fillMaxWidth()
                            .padding(top = QuranSurahMetrics.bismillahTop),
                    color = RoyColors.foreground,
                    fontFamily = QuranFonts.text,
                    fontSize = QuranSurahMetrics.ayahSize,
                    lineHeight = QuranSurahMetrics.ayahLineHeight,
                    textAlign = TextAlign.Center,
                )
            }

            Spacer(Modifier.height(QuranSurahMetrics.sessionTop))

            Column(verticalArrangement = Arrangement.spacedBy(QuranSurahMetrics.ayahGap)) {
                surah.ayahs.forEachIndexed { index, ayah ->
                    val number = index + 1
                    val mark = marks[number]
                    if (mark != null) {
                        QuranBoundaryRow(marks = mark)
                    }
                    AyahCard(
                        number = number,
                        ayah = ayah,
                        onPositioned = { top -> cardTops = cardTops + (number to top) },
                    )
                }
            }
        }

        val primary =
            if (face is QuranPlayerFace.Playing || face is QuranPlayerFace.Paused) onToggle else onPlay
        QuranPlayerPanel(
            face = face,
            saved = saved,
            onPrimary = primary,
            onStop = onStop,
            onRemove = onRemove,
            modifier = Modifier.align(Alignment.BottomEnd),
        )
    }
}

private const val POSITION_WRITE_DELAY_MS = 1200L

@Composable
private fun SurahHeader(summary: QuranSurahSummary) {
    Column(
        modifier = Modifier.fillMaxWidth(),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(QuranSurahMetrics.headerGap),
    ) {
        Box(
            modifier =
                Modifier.fillMaxWidth()
                    .height(QuranSurahMetrics.titleHeight)
                    .testTag(QuranSurahMetrics.TITLE),
            contentAlignment = Alignment.Center,
        ) {
            Text(
                text = summary.name,
                modifier = Modifier.fillMaxWidth().semantics { heading() },
                style =
                    TextStyle(
                        fontSize = QuranSurahMetrics.titleSize,
                        lineHeight = QuranSurahMetrics.titleLineHeight,
                        fontWeight = QuranSurahMetrics.titleWeight,
                        letterSpacing = QuranSurahMetrics.titleTracking,
                        textAlign = TextAlign.Center,
                        brush =
                            Brush.horizontalGradient(
                                listOf(
                                    QuranSurahMetrics.titleStart,
                                    QuranSurahMetrics.titleMiddle,
                                    QuranSurahMetrics.titleEnd,
                                )
                            ),
                    ),
            )
        }
        Text(
            text =
                buildAnnotatedString {
                    append(
                        (if (summary.revelation == "Meccan") QuranSurahCopy.REVELATION_MECCAN
                        else QuranSurahCopy.REVELATION_MEDINAN) + " · "
                    )
                    withStyle(SpanStyle(fontFamily = RoyFonts.digits, fontWeight = FontWeight.Bold)) {
                        append(summary.ayahCount.toString())
                    }
                    append(" " + QuranSurahCopy.AYAH_COUNT)
                },
            modifier = Modifier.height(QuranSurahMetrics.metaHeight).testTag(QuranSurahMetrics.META),
            color = RoyColors.mutedForeground,
            fontSize = QuranSurahMetrics.metaSize,
            lineHeight = QuranSurahMetrics.metaLineHeight,
        )
    }
}

@Composable
private fun AyahCard(number: Int, ayah: String, onPositioned: (Float) -> Unit) {
    val markerId = "ayah-marker-$number"
    val inline =
        mapOf(
            markerId to
                InlineTextContent(
                    placeholder =
                        Placeholder(
                            width = 1.75.em,
                            height = QuranSurahMetrics.markerSize,
                            placeholderVerticalAlign = PlaceholderVerticalAlign.TextCenter,
                        ),
                ) {
                    AyahMarker(number)
                }
        )

    val shape = RoundedCornerShape(QuranSurahMetrics.cardRadius)
    Column(
        modifier =
            Modifier.fillMaxWidth()
                .testTag(QuranSurahMetrics.cardTag(number))
                .onGloballyPositioned { onPositioned(it.positionInParent().y) }
                .clip(shape)
                .background(RoyColors.card.copy(alpha = 0.5f))
                .border(QuranSurahMetrics.borderWidth, RoyColors.border.copy(alpha = 0.6f), shape)
                .padding(QuranSurahMetrics.cardPadding),
    ) {
        Text(
            text =
                buildAnnotatedString {
                    append(QuranFonts.annotated(ayah))
                    appendInlineContent(markerId, number.toString())
                },
            modifier = Modifier.fillMaxWidth().testTag(QuranSurahMetrics.ayahTag(number)),
            inlineContent = inline,
            color = RoyColors.foreground,
            fontFamily = QuranFonts.text,
            fontSize = QuranSurahMetrics.ayahSize,
            lineHeight = QuranSurahMetrics.ayahLineHeight,
        )
    }
}

@Composable
private fun AyahMarker(number: Int) {
    // The placeholder is 1.75em wide and the marker is 1.35em: the extra 0.4em
    // is the page's `margin-inline-start`, so the marker sits at the end of the
    // placeholder and the gap falls on its start, the way the page's does.
    Box(Modifier.fillMaxSize(), contentAlignment = Alignment.CenterEnd) {
        Box(
            modifier =
                Modifier.fillMaxHeight()
                    .aspectRatio(1f)
                    .testTag(QuranSurahMetrics.markerTag(number))
                    .border(
                        QuranSurahMetrics.markerBorder,
                        RoyColors.primary.copy(alpha = 0.5f),
                        CircleShape,
                    ),
            contentAlignment = Alignment.Center,
        ) {
            Text(
                text = number.toString(),
                color = RoyColors.primary,
                fontFamily = RoyFonts.digits,
                fontSize = QuranSurahMetrics.markerNumberSize,
                lineHeight = QuranSurahMetrics.markerNumberSize,
                fontWeight = FontWeight.Bold,
            )
        }
    }
}

@Composable
private fun QuranBoundaryRow(marks: QuranAyahMarks) {
    Row(
        modifier =
            Modifier.fillMaxWidth()
                .testTag(QuranSurahMetrics.BOUNDARY)
                .padding(top = QuranSurahMetrics.boundaryTop, bottom = QuranSurahMetrics.boundaryBottom),
        horizontalArrangement = Arrangement.spacedBy(QuranSurahMetrics.boundaryGap),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (marks.page != null) {
            BoundaryChip(
                label = QuranSurahCopy.BOUNDARY_PAGE,
                number = marks.page,
                bordered = true,
            )
        }
        Box(Modifier.weight(1f).height(1.dp).background(RoyColors.border.copy(alpha = 0.7f)))
        if (marks.juz != null) {
            BoundaryChip(label = QuranSurahCopy.BOUNDARY_JUZ, number = marks.juz, bordered = false)
        }
        if (marks.hizb != null) {
            BoundaryChip(label = QuranSurahCopy.BOUNDARY_HIZB, number = marks.hizb, bordered = false)
        }
        if (marks.sajda != null) {
            val shape = RoundedCornerShape(percent = 50)
            Box(
                modifier =
                    Modifier.clip(shape)
                        .background(RoyColors.primary.copy(alpha = 0.12f))
                        .padding(horizontal = 9.6.dp, vertical = 2.4.dp),
            ) {
                Text(
                    text =
                        if (marks.sajda == "obligatory") QuranSurahCopy.SAJDA_OBLIGATORY
                        else QuranSurahCopy.SAJDA_RECOMMENDED,
                    color = RoyColors.primary,
                    fontSize = QuranSurahMetrics.boundarySize,
                    lineHeight = QuranSurahMetrics.boundaryLineHeight,
                    fontWeight = FontWeight.Bold,
                )
            }
        }
    }
}

@Composable
private fun BoundaryChip(label: String, number: Int, bordered: Boolean) {
    val shape = RoundedCornerShape(percent = 50)
    val base =
        if (bordered) {
            Modifier
                .clip(shape)
                .background(RoyColors.card)
                .border(1.dp, RoyColors.border.copy(alpha = 0.7f), shape)
                .padding(horizontal = 9.6.dp, vertical = 2.4.dp)
        } else {
            Modifier.padding(vertical = 2.4.dp)
        }
    Row(modifier = base, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
        Text(
            text = label,
            color = if (bordered) RoyColors.foreground else RoyColors.mutedForeground,
            fontSize = QuranSurahMetrics.boundarySize,
            lineHeight = QuranSurahMetrics.boundaryLineHeight,
        )
        Text(
            text = number.toString(),
            color = if (bordered) RoyColors.foreground else RoyColors.mutedForeground,
            fontFamily = RoyFonts.digits,
            fontSize = QuranSurahMetrics.boundarySize,
            lineHeight = QuranSurahMetrics.boundaryLineHeight,
            fontWeight = FontWeight.Bold,
        )
    }
}

/** The page's numbers at 393 x 852, and the test tags that name them. */
internal object QuranSurahMetrics {
    const val TITLE = "quran-surah-title"
    const val META = "quran-surah-meta"
    const val BOUNDARY = "quran-boundary"

    fun cardTag(number: Int) = "quran-ayah-card-$number"
    fun ayahTag(number: Int) = "quran-ayah-$number"
    fun markerTag(number: Int) = "quran-ayah-marker-$number"

    val horizontalPadding = 16.dp
    val topPadding = 32.dp
    val bottomPadding = 32.dp

    /** Room for the recitation panel, so the last Ayah ends above it. */
    val playerClearance = 80.dp
    val headerGap = 8.dp
    val sessionTop = 56.dp
    val ayahGap = 16.dp
    val borderWidth = 1.dp

    val titleSize = 30.sp
    val titleLineHeight = 37.5.sp
    val titleHeight = 46.5.dp
    val titleWeight = FontWeight.ExtraBold
    val titleTracking = (-0.025).em
    val titleStart = androidx.compose.ui.graphics.Color(0xFFA684FF)
    val titleMiddle = androidx.compose.ui.graphics.Color(0xFFED6AFF)
    val titleEnd = androidx.compose.ui.graphics.Color(0xFF7C86FF)

    val metaSize = 12.sp
    val metaLineHeight = 18.sp
    val metaHeight = 18.dp

    val bismillahTop = 32.dp
    val cardRadius = 16.dp
    val cardPadding = 16.dp
    val ayahSize = 24.sp
    val ayahLineHeight = 57.6.sp
    val markerSize = 1.35.em
    val markerBorder = 1.5.dp
    val markerNumberSize = 12.48.sp

    val boundaryTop = 28.dp
    val boundaryBottom = 8.dp
    val boundaryGap = 8.dp
    val boundarySize = 11.sp
    val boundaryLineHeight = 17.6.sp
}
