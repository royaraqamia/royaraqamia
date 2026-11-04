package com.royaraqamia.app.quran

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
import androidx.compose.foundation.layout.requiredHeight
import androidx.compose.foundation.layout.requiredWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.error
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import com.royaraqamia.app.theme.RoyColors
import com.royaraqamia.app.theme.RoyFonts
import com.royaraqamia.app.ui.vectors.LucideVectors
import kotlinx.coroutines.launch

/**
 * The sura index, as the site's `/quran` draws it (#955).
 *
 * The list is the navigation the reader uses to open a sura; the field above it
 * narrows by name and searches the Ayat, and the card above that says where the
 * reader stopped. All of it reads the vendored text, so it works with the radio
 * off, and the words come from `shared/copy/quran-index.json` so the app and the
 * page cannot drift.
 *
 * The search corpus is read when the field is first used, not with the screen:
 * it is the whole text, and a reader who came to the list should not pay for a
 * search they did not make.
 */
@Composable
fun QuranIndexScreen(
    index: QuranIndex,
    pages: QuranPages,
    position: QuranReadingPosition?,
    loadSearch: (suspend () -> QuranSearchAsset?)?,
    onOpenSurah: (Int) -> Unit,
    onOpenAyah: (surah: Int, ayah: Int) -> Unit,
    modifier: Modifier = Modifier,
) {
    val scroll = rememberScrollState()
    val scope = rememberCoroutineScope()

    var query by remember { mutableStateOf("") }
    var corpusState by remember { mutableStateOf(CorpusState.Idle) }
    var corpus by remember { mutableStateOf<QuranSearchAsset?>(null) }
    var exact by remember { mutableStateOf<List<String>>(emptyList()) }
    var loose by remember { mutableStateOf<List<String>>(emptyList()) }
    var shown by remember { mutableIntStateOf(QuranSearch.PAGE_SIZE) }
    var requested by remember { mutableStateOf(false) }

    fun ensureCorpus() {
        if (loadSearch == null || requested) return
        requested = true
        corpusState = CorpusState.Loading
        scope.launch {
            val loaded = runCatching { loadSearch.invoke() }.getOrNull()
            if (loaded == null) {
                requested = false
                corpusState = CorpusState.Failed
            } else {
                corpus = loaded
                exact = QuranSearch.exactCorpus(loaded.ayahs)
                loose = QuranSearch.looseCorpus(loaded.ayahs)
                corpusState = CorpusState.Ready
            }
        }
    }

    val folded = QuranSearch.normalize(query)
    val longEnough = folded.length >= QuranSearch.MIN_QUERY
    val matchedSurahs =
        if (folded.isEmpty()) index.surahs
        else index.surahs.filter { QuranSearch.normalize(it.name).contains(folded) }

    val answer =
        remember(query, shown, corpusState) {
            if (corpus == null || !longEnough) null
            else QuranSearch.find(exact, loose, query, shown)
        }

    val status =
        when {
            !longEnough -> ""
            loadSearch == null -> QuranIndexCopy.SEARCH_UNAVAILABLE
            corpusState == CorpusState.Loading -> QuranIndexCopy.SEARCH_LOADING
            corpusState == CorpusState.Failed -> QuranIndexCopy.SEARCH_FAILED
            corpusState == CorpusState.Ready ->
                QuranIndexCopy.SEARCH_COUNT
                    .replace("{surahs}", matchedSurahs.size.toString())
                    .replace("{ayahs}", (answer?.total ?: 0).toString())
            else -> ""
        }

    Column(
        modifier =
            modifier
                .fillMaxSize()
                .verticalScroll(scroll)
                .padding(horizontal = QuranIndexMetrics.horizontalPadding)
                .padding(top = QuranIndexMetrics.topPadding, bottom = QuranIndexMetrics.bottomPadding),
        verticalArrangement = Arrangement.spacedBy(QuranIndexMetrics.blockGap),
    ) {
        Box(
            modifier =
                Modifier.fillMaxWidth()
                    .height(QuranIndexMetrics.titleHeight)
                    .testTag(QuranIndexMetrics.TITLE),
            contentAlignment = Alignment.Center,
        ) {
            Text(
                text = QuranIndexCopy.PAGE_TITLE,
                modifier = Modifier.fillMaxWidth().semantics { heading() },
                style =
                    TextStyle(
                        fontSize = QuranIndexMetrics.titleSize,
                        lineHeight = QuranIndexMetrics.titleLineHeight,
                        fontWeight = QuranIndexMetrics.titleWeight,
                        letterSpacing = QuranIndexMetrics.titleTracking,
                        textAlign = TextAlign.Center,
                        brush =
                            Brush.horizontalGradient(
                                listOf(
                                    QuranIndexMetrics.titleStart,
                                    QuranIndexMetrics.titleMiddle,
                                    QuranIndexMetrics.titleEnd,
                                )
                            ),
                    ),
            )
        }

        if (position != null) {
            ResumeCard(position = position, names = index.surahs, onOpen = onOpenAyah)
        }

        Column(verticalArrangement = Arrangement.spacedBy(QuranIndexMetrics.searchGap)) {
            SearchField(
                query = query,
                onQueryChange = {
                    query = it
                    shown = QuranSearch.PAGE_SIZE
                    ensureCorpus()
                },
                onFocus = ::ensureCorpus,
            )

            if (status.isEmpty()) {
                // The page's empty status <p> has no height, but it is still a
                // flex child: the two gaps around it are what separate the field
                // from the list. A zero-height spacer keeps that spacing.
                Spacer(Modifier.height(0.dp))
            } else {
                Text(
                    text = status,
                    fontSize = QuranIndexMetrics.statusSize,
                    lineHeight = QuranIndexMetrics.statusLineHeight,
                    color = RoyColors.mutedForeground,
                )
            }

            if (longEnough && corpusState == CorpusState.Failed) {
                Text(
                    text = QuranIndexCopy.SEARCH_RETRY,
                    modifier =
                        Modifier.fillMaxWidth()
                            .clickable {
                                requested = false
                                ensureCorpus()
                            }
                            .padding(vertical = 8.dp),
                    color = RoyColors.primary,
                    fontSize = QuranIndexMetrics.statusSize,
                    textAlign = TextAlign.Center,
                )
            }

            SurahList(surahs = matchedSurahs, onOpenSurah = onOpenSurah)

            if (answer != null && corpus != null && answer.positions.isNotEmpty()) {
                SearchResults(
                    answer = answer,
                    corpus = corpus!!,
                    counts = index.surahs.map { it.ayahCount },
                    names = index.surahs,
                    query = query,
                    shown = shown,
                    onShowMore = { shown += QuranSearch.PAGE_SIZE },
                    onOpenAyah = onOpenAyah,
                )
            }

            if (longEnough && corpusState == CorpusState.Ready && (answer?.total ?: 0) == 0) {
                Text(
                    text = QuranIndexCopy.SEARCH_NO_RESULTS,
                    modifier = Modifier.fillMaxWidth(),
                    color = RoyColors.mutedForeground,
                    fontSize = QuranIndexMetrics.rowNameSize,
                    textAlign = TextAlign.Center,
                )
            }
        }

        if (pages.pages.isNotEmpty()) {
            PageJump(pages = pages, onOpenAyah = onOpenAyah)
        }
    }
}

private enum class CorpusState { Idle, Loading, Ready, Failed }

@Composable
private fun SearchField(query: String, onQueryChange: (String) -> Unit, onFocus: () -> Unit) {
    Box(
        modifier =
            Modifier.fillMaxWidth()
                .height(QuranIndexMetrics.searchHeight)
                .testTag(QuranIndexMetrics.SEARCH)
                .semantics { contentDescription = QuranIndexCopy.SEARCH_LABEL }
                .clip(RoundedCornerShape(QuranIndexMetrics.searchRadius))
                .background(RoyColors.background.copy(alpha = 0.6f))
                .border(
                    QuranIndexMetrics.borderWidth,
                    RoyColors.border.copy(alpha = 0.5f),
                    RoundedCornerShape(QuranIndexMetrics.searchRadius),
                ),
    ) {
        BasicTextField(
            value = query,
            onValueChange = onQueryChange,
            modifier =
                Modifier.fillMaxSize()
                    .padding(horizontal = QuranIndexMetrics.searchHorizontalPadding)
                    .semantics { contentDescription = QuranIndexCopy.SEARCH_LABEL }
                    .onFocusChanged { if (it.isFocused) onFocus() },
            singleLine = true,
            textStyle =
                TextStyle(
                    fontFamily = RoyFonts.ui,
                    fontSize = QuranIndexMetrics.searchTextSize,
                    color = RoyColors.foreground,
                ),
            cursorBrush = SolidColor(RoyColors.primary),
            decorationBox = { inner ->
                Box(Modifier.fillMaxSize(), contentAlignment = Alignment.CenterStart) {
                    if (query.isEmpty()) {
                        Text(
                            text = QuranIndexCopy.SEARCH_PLACEHOLDER,
                            color = RoyColors.mutedForeground.copy(alpha = 0.4f),
                            fontSize = QuranIndexMetrics.searchTextSize,
                        )
                    }
                    inner()
                }
            },
        )

        Icon(
            imageVector = LucideVectors.Search,
            contentDescription = null,
            tint = RoyColors.mutedForeground.copy(alpha = 0.4f),
            modifier =
                Modifier.align(Alignment.CenterStart)
                    .padding(start = QuranIndexMetrics.searchIconPadding)
                    .size(QuranIndexMetrics.searchIconSize),
        )

        if (query.isNotEmpty()) {
            Box(
                modifier =
                    Modifier.align(Alignment.CenterEnd)
                        .padding(end = 12.dp)
                        .size(24.dp)
                        .clip(RoundedCornerShape(percent = 50))
                        .background(RoyColors.mutedForeground.copy(alpha = 0.2f))
                        .semantics { contentDescription = QuranIndexCopy.CANCEL_SEARCH }
                        .clickable(role = Role.Button) { onQueryChange("") },
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    text = "×",
                    color = RoyColors.mutedForeground,
                    fontSize = 16.sp,
                    lineHeight = 16.sp,
                )
            }
        }
    }
}

@Composable
private fun SurahList(surahs: List<QuranSurahSummary>, onOpenSurah: (Int) -> Unit) {
    if (surahs.isEmpty()) {
        Text(
            text = QuranIndexCopy.EMPTY_LIST,
            modifier =
                Modifier.fillMaxWidth()
                    .clip(RoundedCornerShape(16.dp))
                    .background(RoyColors.card.copy(alpha = 0.6f))
                    .border(1.dp, RoyColors.border.copy(alpha = 0.6f), RoundedCornerShape(16.dp))
                    .padding(24.dp),
            color = RoyColors.mutedForeground,
            fontSize = QuranIndexMetrics.rowNameSize,
            textAlign = TextAlign.Center,
        )
        return
    }

    Column(
        modifier = Modifier.fillMaxWidth().testTag(QuranIndexMetrics.LIST),
        verticalArrangement = Arrangement.spacedBy(QuranIndexMetrics.listGap),
    ) {
        surahs.forEachIndexed { index, surah ->
            SurahRow(surah = surah, index = index, onOpen = { onOpenSurah(surah.n) })
        }
    }
}

@Composable
private fun SurahRow(surah: QuranSurahSummary, index: Int, onOpen: () -> Unit) {
    val shape = RoundedCornerShape(QuranIndexMetrics.rowRadius)
    Row(
        modifier =
            Modifier.fillMaxWidth()
                .testTag(QuranIndexMetrics.rowTag(index))
                .clip(shape)
                .background(RoyColors.card.copy(alpha = 0.6f))
                .border(QuranIndexMetrics.borderWidth, RoyColors.border.copy(alpha = 0.6f), shape)
                .clickable(role = Role.Button, onClick = onOpen)
                .padding(QuranIndexMetrics.borderWidth)
                .padding(
                    horizontal = QuranIndexMetrics.rowPaddingHorizontal,
                    vertical = QuranIndexMetrics.rowPaddingVertical,
                ),
        horizontalArrangement = Arrangement.spacedBy(QuranIndexMetrics.rowGap),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            modifier =
                Modifier.size(QuranIndexMetrics.numberSize)
                    .testTag(QuranIndexMetrics.numberTag(index))
                    .clip(RoundedCornerShape(QuranIndexMetrics.numberRadius))
                    .background(RoyColors.primary.copy(alpha = 0.1f)),
            contentAlignment = Alignment.Center,
        ) {
            Text(
                text = surah.n.toString(),
                color = RoyColors.primary,
                fontFamily = RoyFonts.digits,
                fontSize = QuranIndexMetrics.numberTextSize,
                lineHeight = QuranIndexMetrics.numberLineHeight,
                fontWeight = FontWeight.Bold,
            )
        }

        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = surah.name,
                modifier = Modifier.testTag(QuranIndexMetrics.nameTag(index)),
                color = RoyColors.foreground,
                fontSize = QuranIndexMetrics.rowNameSize,
                lineHeight = QuranIndexMetrics.rowNameLineHeight,
                fontWeight = FontWeight.Bold,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            Text(
                text = surahMeta(surah),
                modifier = Modifier.testTag(QuranIndexMetrics.metaTag(index)),
                color = RoyColors.mutedForeground,
                fontSize = QuranIndexMetrics.rowMetaSize,
                lineHeight = QuranIndexMetrics.rowMetaLineHeight,
            )
        }
    }
}

private fun surahMeta(surah: QuranSurahSummary): AnnotatedString =
    buildAnnotatedString {
        append(
            (if (surah.revelation == "Meccan") QuranIndexCopy.REVELATION_MECCAN
            else QuranIndexCopy.REVELATION_MEDINAN) + " · "
        )
        withStyle(SpanStyle(fontFamily = RoyFonts.digits, fontWeight = FontWeight.Bold)) {
            append(surah.ayahCount.toString())
        }
        append(" " + QuranIndexCopy.AYAH_COUNT)
    }

@Composable
private fun SearchResults(
    answer: QuranSearch.Answer,
    corpus: QuranSearchAsset,
    counts: List<Int>,
    names: List<QuranSurahSummary>,
    query: String,
    shown: Int,
    onShowMore: () -> Unit,
    onOpenAyah: (Int, Int) -> Unit,
) {
    val needle = if (answer.loose) QuranSearch.normalizeLoose(query) else QuranSearch.normalize(query)
    val groups = linkedMapOf<Int, MutableList<Triple<Int, String, QuranSearch.Match?>>>()
    for (position in answer.positions.take(shown)) {
        val place = QuranSearch.surahAyahOf(position, counts) ?: continue
        val text = corpus.ayahs.getOrNull(position) ?: continue
        groups.getOrPut(place.first) { mutableListOf() }
            .add(Triple(place.second, text, QuranSearch.mark(text, needle, answer.loose)))
    }

    Column(
        modifier =
            Modifier.fillMaxWidth()
                .clip(RoundedCornerShape(16.dp))
                .background(RoyColors.card.copy(alpha = 0.4f))
                .border(1.dp, RoyColors.border.copy(alpha = 0.6f), RoundedCornerShape(16.dp))
                .semantics { contentDescription = QuranIndexCopy.SEARCH_RESULTS_LABEL }
                .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        for ((surah, hits) in groups) {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(
                    text =
                        "${QuranIndexCopy.SURAH_LABEL} ${names.getOrNull(surah - 1)?.name.orEmpty()} · " +
                            "${hits.size} ${QuranIndexCopy.AYAH_COUNT}",
                    color = RoyColors.mutedForeground,
                    fontSize = QuranIndexMetrics.statusSize,
                    fontWeight = FontWeight.Bold,
                )
                for ((ayah, text, match) in hits) {
                    val shape = RoundedCornerShape(12.dp)
                    Column(
                        modifier =
                            Modifier.fillMaxWidth()
                                .clip(shape)
                                .background(RoyColors.background.copy(alpha = 0.6f))
                                .border(1.dp, RoyColors.border.copy(alpha = 0.5f), shape)
                                .clickable(role = Role.Button) { onOpenAyah(surah, ayah) }
                                .padding(horizontal = 12.dp, vertical = 10.dp),
                        verticalArrangement = Arrangement.spacedBy(4.dp),
                    ) {
                        Text(
                            text = "${QuranIndexCopy.AYAH_LABEL} $ayah",
                            color = RoyColors.mutedForeground,
                            fontSize = 11.sp,
                            lineHeight = 17.6.sp,
                        )
                        Text(
                            text = highlighted(text, match),
                            color = RoyColors.foreground,
                            fontFamily = QuranFonts.text,
                            fontSize = 20.sp,
                            lineHeight = 40.sp,
                        )
                    }
                }
            }
        }

        if (answer.total > shown) {
            Text(
                text = QuranIndexCopy.SEARCH_SHOW_MORE,
                modifier =
                    Modifier.fillMaxWidth()
                        .clip(RoundedCornerShape(percent = 50))
                        .border(1.dp, RoyColors.border.copy(alpha = 0.6f), RoundedCornerShape(percent = 50))
                        .clickable(onClick = onShowMore)
                        .padding(vertical = 6.dp),
                color = RoyColors.mutedForeground,
                fontSize = QuranIndexMetrics.statusSize,
                fontWeight = FontWeight.Bold,
                textAlign = TextAlign.Center,
            )
        }
    }
}

private fun highlighted(text: String, match: QuranSearch.Match?): AnnotatedString =
    buildAnnotatedString {
        if (match == null) {
            append(QuranFonts.annotated(text))
        } else {
            append(QuranFonts.annotated(match.before))
            withStyle(SpanStyle(background = RoyColors.primary.copy(alpha = 0.2f))) {
                append(QuranFonts.annotated(match.match))
            }
            append(QuranFonts.annotated(match.after))
        }
    }

@Composable
private fun ResumeCard(
    position: QuranReadingPosition,
    names: List<QuranSurahSummary>,
    onOpen: (Int, Int) -> Unit,
) {
    val shape = RoundedCornerShape(16.dp)
    Row(
        modifier =
            Modifier.fillMaxWidth()
                .clip(shape)
                .background(RoyColors.primary.copy(alpha = 0.05f))
                .border(1.dp, RoyColors.primary.copy(alpha = 0.3f), shape)
                .clickable(role = Role.Button) { onOpen(position.surah, position.ayah) }
                .padding(horizontal = 16.dp, vertical = 14.dp),
        horizontalArrangement = Arrangement.spacedBy(16.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(
            imageVector = LucideVectors.BookOpen,
            contentDescription = null,
            tint = RoyColors.primary,
            modifier = Modifier.size(20.dp),
        )
        Column {
            Text(
                text = QuranIndexCopy.RESUME_READING,
                color = RoyColors.mutedForeground,
                fontSize = 11.sp,
                lineHeight = 17.6.sp,
            )
            Text(
                text = buildAnnotatedString {
                    append("${names.getOrNull(position.surah - 1)?.name.orEmpty()} · ${QuranIndexCopy.RESUME_AYAH} ")
                    withStyle(SpanStyle(fontFamily = RoyFonts.digits, fontWeight = FontWeight.Bold)) {
                        append(position.ayah.toString())
                    }
                },
                color = RoyColors.foreground,
                fontSize = QuranIndexMetrics.rowNameSize,
                lineHeight = QuranIndexMetrics.rowNameLineHeight,
                fontWeight = FontWeight.Bold,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
    }
}

@Composable
private fun PageJump(pages: QuranPages, onOpenAyah: (Int, Int) -> Unit) {
    var value by remember { mutableStateOf("") }
    var invalid by remember { mutableStateOf(false) }

    fun submit() {
        val page = toLatinDigits(value).trim().toIntOrNull()
        val boundary = if (page != null && page in 1..QURAN_PAGE_COUNT) pages.pages.getOrNull(page - 1) else null
        if (boundary == null) {
            invalid = true
        } else {
            invalid = false
            onOpenAyah(boundary.surah, boundary.ayah)
        }
    }

    Column(
        modifier =
            Modifier.fillMaxWidth()
                .testTag(QuranIndexMetrics.PAGE_JUMP)
                .clip(RoundedCornerShape(16.dp))
                .background(RoyColors.card.copy(alpha = 0.6f))
                .border(1.dp, RoyColors.border.copy(alpha = 0.6f), RoundedCornerShape(16.dp))
                .padding(QuranIndexMetrics.borderWidth)
                .padding(horizontal = 16.dp, vertical = 12.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Row(
            horizontalArrangement = Arrangement.spacedBy(12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                text = QuranIndexCopy.PAGE_JUMP_LABEL,
                color = RoyColors.mutedForeground,
                fontSize = 12.sp,
                lineHeight = 18.sp,
                fontWeight = FontWeight.Bold,
            )
            Box(
                modifier =
                    Modifier.requiredWidth(120.dp)
                        .requiredHeight(34.2.dp)
                        .testTag(QuranIndexMetrics.PAGE_JUMP_FIELD)
                        .semantics {
                            contentDescription = QuranIndexCopy.PAGE_JUMP_LABEL
                            if (invalid) {
                                error(
                                    QuranIndexCopy.PAGE_JUMP_ERROR.replace(
                                        "{max}",
                                        QURAN_PAGE_COUNT.toString(),
                                    )
                                )
                            }
                        }
                        .clip(RoundedCornerShape(9.6.dp))
                        .background(RoyColors.background.copy(alpha = 0.8f))
                        .border(1.dp, RoyColors.border.copy(alpha = 0.6f), RoundedCornerShape(9.6.dp))
                        .padding(horizontal = 9.6.dp),
                contentAlignment = Alignment.CenterStart,
            ) {
                BasicTextField(
                    value = value,
                    onValueChange = {
                        value = it
                        invalid = false
                    },
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true,
                    textStyle =
                        TextStyle(
                            fontFamily = RoyFonts.ui,
                            fontSize = 14.sp,
                            color = RoyColors.foreground,
                        ),
                    cursorBrush = SolidColor(RoyColors.primary),
                    decorationBox = { inner ->
                        Box(Modifier.fillMaxSize(), contentAlignment = Alignment.CenterStart) {
                            if (value.isEmpty()) {
                                Text(
                                    text = QuranIndexCopy.PAGE_JUMP_PLACEHOLDER.replace(
                                        "{max}",
                                        QURAN_PAGE_COUNT.toString(),
                                    ),
                                    color = RoyColors.mutedForeground,
                                    fontSize = 14.sp,
                                )
                            }
                            inner()
                        }
                    },
                )
            }
            Box(
                modifier =
                    Modifier.requiredWidth(60.8.dp)
                        .requiredHeight(32.7.dp)
                        .clip(RoundedCornerShape(9.6.dp))
                        .background(RoyColors.card)
                        .border(1.dp, RoyColors.border.copy(alpha = 0.7f), RoundedCornerShape(9.6.dp))
                        .clickable(role = Role.Button) { submit() }
                        .padding(horizontal = 14.4.dp)
                        .testTag(QuranIndexMetrics.PAGE_JUMP_SUBMIT),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    text = QuranIndexCopy.PAGE_JUMP_SUBMIT,
                    color = RoyColors.foreground,
                    fontSize = 13.sp,
                    lineHeight = 19.5.sp,
                    fontWeight = FontWeight.Bold,
                )
            }
        }

        if (invalid) {
            Text(
                text = QuranIndexCopy.PAGE_JUMP_ERROR.replace("{max}", QURAN_PAGE_COUNT.toString()),
                modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite },
                color = RoyColors.destructive,
                fontSize = 12.sp,
                lineHeight = 18.sp,
            )
        }
    }
}

/** Arabic-Indic and Persian digits a phone's numeric keyboard can produce. */
internal fun toLatinDigits(value: String): String =
    buildString {
        for (character in value) {
            append(
                when (character) {
                    in '\u0660'..'\u0669' -> '0' + (character - '\u0660')
                    in '\u06F0'..'\u06F9' -> '0' + (character - '\u06F0')
                    else -> character
                }
            )
        }
    }

internal const val QURAN_PAGE_COUNT = 604

/** The page's numbers at 393 x 852, and the test tags that name them. */
internal object QuranIndexMetrics {
    const val TITLE = "quran-title"
    const val SEARCH = "quran-search"
    const val LIST = "quran-list"
    const val PAGE_JUMP = "quran-page-jump"
    const val PAGE_JUMP_FIELD = "quran-page-jump-field"
    const val PAGE_JUMP_SUBMIT = "quran-page-jump-submit"

    fun rowTag(index: Int) = "quran-row-$index"
    fun numberTag(index: Int) = "quran-row-number-$index"
    fun nameTag(index: Int) = "quran-row-name-$index"
    fun metaTag(index: Int) = "quran-row-meta-$index"

    val horizontalPadding = 16.dp
    val topPadding = 40.dp
    val bottomPadding = 40.dp
    val blockGap = 32.dp
    val searchGap = 16.dp
    val borderWidth = 1.dp

    val titleSize = 30.sp
    val titleLineHeight = 37.5.sp
    val titleHeight = 46.5.dp
    val titleWeight = FontWeight.ExtraBold
    val titleTracking = (-0.025).em
    val titleStart = androidx.compose.ui.graphics.Color(0xFFA684FF)
    val titleMiddle = androidx.compose.ui.graphics.Color(0xFFED6AFF)
    val titleEnd = androidx.compose.ui.graphics.Color(0xFF7C86FF)

    val searchHeight = 44.dp
    val searchRadius = 12.dp
    val searchTextSize = 14.sp
    val searchHorizontalPadding = 40.dp
    val searchIconPadding = 14.dp
    val searchIconSize = 16.dp
    val statusSize = 12.sp
    val statusLineHeight = 18.sp

    val listGap = 8.dp
    val rowRadius = 12.dp
    val rowPaddingHorizontal = 12.dp
    val rowPaddingVertical = 10.dp
    val rowGap = 12.dp
    val numberSize = 36.dp
    val numberRadius = 8.dp
    val numberTextSize = 14.sp
    val numberLineHeight = 22.4.sp
    val rowNameSize = 16.sp
    val rowNameLineHeight = 24.sp
    val rowMetaSize = 11.sp
    val rowMetaLineHeight = 17.6.sp
}
