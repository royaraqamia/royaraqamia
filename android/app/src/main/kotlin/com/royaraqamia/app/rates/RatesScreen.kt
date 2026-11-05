package com.royaraqamia.app.rates

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExposedDropdownMenuBox
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.MenuAnchorType
import androidx.compose.material3.Surface
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
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.royaraqamia.app.contracts.generated.RatesBoard
import com.royaraqamia.app.contracts.generated.RatesBoardCurrenciesItem
import com.royaraqamia.app.theme.LocalRoySpacing
import com.royaraqamia.app.theme.Recipes
import com.royaraqamia.app.theme.RoyColors
import com.royaraqamia.app.theme.RoyShape
import com.royaraqamia.app.ui.vectors.LucideVectors

/**
 * The site's `/rates` as a screen (#658, #897).
 *
 * The page: its title, the day the numbers are quoted from, the stale badge when the
 * feed is behind, and the two converters the page draws — currencies, then gold and
 * silver. The screen owns what the page owns around them: the one read, and the
 * retry a failed one offers.
 *
 * The boxes are the page's own numbers ([RatesMetrics]) rather than Material's
 * defaults: a 44-high field at radius 12, a 24-radius card with a 24 padding inside
 * a 1px border. The visual gate compares those boxes with the page's, so a changed
 * one fails `check:visual` instead of drifting quietly (ADR-0118).
 *
 * The offline face is the matrix's promise kept: a board that was read is kept, and
 * a read that failed shows it with the day it was quoted — the numbers carry their
 * own date, so a snapshot is "these rates, from then" and never passes itself off as
 * today's. Only with nothing kept is there nothing to show, and then the page's own
 * failure sentence is the whole screen with one way to try again.
 *
 * The loading face is drawn as the recipe's skeleton rather than a spinner: it is
 * the same shape the plan card uses, and the site has no sentence for it.
 */
@Composable
fun RatesScreen(repository: RatesRepository, modifier: Modifier = Modifier) {
    var state by remember { mutableStateOf<RatesUiState?>(null) }
    var attempts by remember { mutableStateOf(0) }

    LaunchedEffect(repository, attempts) {
        state = null
        state =
            when (val result = repository.board()) {
                is RatesResult.Live -> RatesUiState.Live(result.board)
                is RatesResult.Snapshot -> RatesUiState.Snapshot(result.board)
                RatesResult.Unavailable -> RatesUiState.Unavailable
            }
    }

    RatesScreenContent(state = state, onRetry = { attempts += 1 }, modifier = modifier)
}

/**
 * The screen over a board the caller already read, so the visual gate can draw it
 * without a client (#897, ADR-0118): the test composes this and never loads.
 */
@Composable
internal fun RatesScreen(board: RatesBoard, modifier: Modifier = Modifier) {
    RatesScreenContent(state = RatesUiState.Live(board), onRetry = {}, modifier = modifier)
}

@Composable
private fun RatesScreenContent(
    state: RatesUiState?,
    onRetry: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier =
            modifier
                .fillMaxSize()
                .background(RoyColors.background)
                .verticalScroll(rememberScrollState())
                .padding(horizontal = RatesMetrics.horizontalPadding)
                .padding(vertical = RatesMetrics.horizontalPadding),
    ) {
        Box(
            modifier =
                Modifier.testTag(RatesMetrics.TITLE)
                    .fillMaxWidth()
                    .height(RatesMetrics.titleHeight),
            contentAlignment = Alignment.Center,
        ) {
            Text(
                text = RatesPageCopy.PAGE_TITLE,
                style =
                    TextStyle(
                        fontSize = RatesMetrics.titleSize,
                        fontWeight = RatesMetrics.titleWeight,
                        lineHeight = RatesMetrics.titleLineHeight,
                        textAlign = TextAlign.Center,
                    ),
                color = RoyColors.primary,
                textAlign = TextAlign.Center,
            )
        }

        Spacer(Modifier.height(RatesMetrics.titleToBoard))

        when (val shown = state) {
            null -> Loading()
            is RatesUiState.Live -> Body(shown.board)
            is RatesUiState.Snapshot -> Body(shown.board)
            RatesUiState.Unavailable -> Unavailable(onRetry = onRetry)
        }
    }
}

/** The board's freshness line, the stale badge, and the two converters. */
@Composable
private fun Body(board: RatesBoard) {
    BoardLine(board)

    Spacer(Modifier.height(RatesMetrics.boardToConverter))

    RatesConverterCard(board)

    Spacer(Modifier.height(RatesMetrics.sectionGap))

    RatesMetalsCard(board)
}

/** The day the numbers are quoted from, and the badge when the feed is behind. */
@Composable
private fun BoardLine(board: RatesBoard) {
    Row(
        modifier =
            Modifier.testTag(RatesMetrics.BOARD)
                .fillMaxWidth()
                .height(RatesMetrics.boardHeight),
        horizontalArrangement = Arrangement.spacedBy(8.dp, Alignment.CenterHorizontally),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            text =
                "${RatesPageCopy.UPDATED_LABEL} ${RatesFormat.hijri(board.providerQuoteDate)} — " +
                    RatesFormat.gregorian(board.providerQuoteDate),
            style = TextStyle(fontSize = RatesMetrics.boardTextSize, lineHeight = RatesMetrics.boardTextLineHeight),
            color = Recipes.Row.labelColor,
            maxLines = 1,
        )
        if (board.isStale) {
            Surface(
                shape = Recipes.Badge.radius,
                color = RoyColors.warning.copy(alpha = 0.1f),
                border = BorderStroke(1.dp, RoyColors.warning.copy(alpha = 0.3f)),
            ) {
                Text(
                    text = RatesPageCopy.STALE_BADGE,
                    modifier = Modifier.padding(horizontal = 12.dp, vertical = 2.dp),
                    style = TextStyle(fontSize = RatesMetrics.boardTextSize, fontWeight = FontWeight.Bold),
                    color = RoyColors.warning,
                )
            }
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

/**
 * The page's own sentence for a screen with nothing to show.
 *
 * It is the whole failure — no retry button — for the same reason the page has
 * none: the board is read once per visit, and a visitor who wants another try
 * reloads. The one addition is the tap that does it here, so a phone is not a dead
 * end where the browser is a reload button.
 */
@Composable
private fun Unavailable(onRetry: () -> Unit) {
    val spacing = LocalRoySpacing.current

    Column(
        modifier = Modifier.fillMaxWidth().clickable(onClick = onRetry),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(spacing.elementGapSm),
    ) {
        Text(
            text = RatesPageCopy.FAILURE_BODY,
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            textAlign = TextAlign.Center,
        )
    }
}

/** The site's result box: the figure and its currency, then the line that qualifies it. */
@Composable
internal fun RatesResultBox(
    modifier: Modifier = Modifier,
    conversion: Conversion?,
    targetCode: String,
    oldLiraAmount: Double?,
    basisCaption: String?,
    staleMarketAsOf: String?,
    copy: RatesResultCopy,
) {
    val shape = RoundedCornerShape(RatesMetrics.resultRadius)

    Column(
        modifier =
            modifier.fillMaxWidth()
                .clip(shape)
                .background(RoyColors.primary.copy(alpha = 0.05f))
                .border(1.dp, RoyColors.primary.copy(alpha = 0.2f), shape)
                .padding(RatesMetrics.resultPadding + 1.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        if (conversion == null) {
            Text(
                text = copy.emptyResult,
                modifier = Modifier.height(RatesMetrics.resultFigureHeight),
                style =
                    TextStyle(
                        fontSize = RatesMetrics.resultFigureSize,
                        lineHeight = RatesMetrics.resultFigureLineHeight,
                    ),
                color = Recipes.Row.labelColor,
            )
            Spacer(Modifier.height(RatesMetrics.resultNoteGap))
            Text(
                text = copy.noConversion,
                style = TextStyle(fontSize = RatesMetrics.resultNoteSize),
                color = RoyColors.destructive,
                textAlign = TextAlign.Center,
            )
            return@Column
        }

        Row(
            modifier = Modifier.height(RatesMetrics.resultFigureHeight),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                text = if (targetCode == "SYP") copy.newLira else RatesFormat.symbol(targetCode),
                style = TextStyle(fontSize = RatesMetrics.resultSymbolSize),
                color = Recipes.Row.labelColor,
            )
            Text(
                text = RatesFormat.value(conversion.result),
                style =
                    TextStyle(
                        fontSize = RatesMetrics.resultFigureSize,
                        fontWeight = FontWeight(800),
                    ),
                color = RoyColors.primary,
            )
        }

        if (oldLiraAmount != null) {
            Spacer(Modifier.height(RatesMetrics.resultNoteGap))
            Text(
                text = "${RatesFormat.value(oldLiraAmount)} ${copy.oldLira}",
                style = TextStyle(fontSize = RatesMetrics.resultNoteSize),
                color = Recipes.Row.labelColor,
            )
        } else if (basisCaption != null) {
            Spacer(Modifier.height(RatesMetrics.resultNoteGap))
            Text(
                text = basisCaption,
                style = TextStyle(fontSize = RatesMetrics.resultNoteSize),
                color = Recipes.Row.labelColor,
            )
        }

        if (staleMarketAsOf != null) {
            Spacer(Modifier.height(RatesMetrics.resultNoteGap / 2f))
            Text(
                text =
                    "${copy.stalePrefix} ${RatesFormat.hijri(staleMarketAsOf)} — " +
                        RatesFormat.gregorian(staleMarketAsOf),
                style = TextStyle(fontSize = RatesMetrics.resultNoteSize),
                color = RoyColors.warning,
            )
        }
    }
}

/** The sentences a result box draws, from whichever card's copy source owns it. */
internal data class RatesResultCopy(
    val newLira: String,
    val oldLira: String,
    val stalePrefix: String,
    val noConversion: String,
    val emptyResult: String,
)

/** The site's label line: 14-point text in the 20-high line box the page reserves. */
@Composable
internal fun RatesLabel(text: String) {
    Box(
        modifier = Modifier.fillMaxWidth().height(RatesMetrics.labelHeight),
        contentAlignment = Alignment.CenterStart,
    ) {
        Text(
            text = text,
            style = TextStyle(fontSize = RatesMetrics.labelTextSize, lineHeight = RatesMetrics.labelLineHeight),
            color = RoyColors.foreground,
        )
    }
}

/**
 * A currency picker over the board's own list: the same 44-high field the page's
 * trigger draws, with the page's own dropdown under it.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun CurrencyField(
    label: String,
    tag: String,
    selected: String,
    currencies: List<RatesBoardCurrenciesItem>,
    onSelect: (String) -> Unit,
) {
    var open by remember { mutableStateOf(false) }
    val current = currencies.firstOrNull { it.code == selected }
    val shape = RoundedCornerShape(RatesMetrics.fieldRadius)

    Column(modifier = Modifier.fillMaxWidth()) {
        RatesLabel(label)
        Spacer(Modifier.height(RatesMetrics.labelGap))

        ExposedDropdownMenuBox(expanded = open, onExpandedChange = { open = it }) {
            Row(
                modifier =
                    Modifier.testTag(tag)
                        .fillMaxWidth()
                        .height(RatesMetrics.fieldHeight)
                        .clip(shape)
                        .background(RoyColors.background.copy(alpha = 0.8f))
                        .border(1.dp, RoyColors.input.copy(alpha = 0.8f), shape)
                        .semantics { contentDescription = label }
                        .menuAnchor(MenuAnchorType.PrimaryNotEditable, enabled = true)
                        .padding(horizontal = RatesMetrics.selectPadding),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    text = if (current == null) selected else "${current.name} (${current.code})",
                    style = TextStyle(fontSize = RatesMetrics.fieldTextSize),
                    color = RoyColors.foreground,
                    maxLines = 1,
                )
                Icon(
                    imageVector = LucideVectors.ChevronDown,
                    contentDescription = null,
                    tint = RoyColors.mutedForeground,
                    modifier = Modifier.size(Recipes.Glyph.sm),
                )
            }

            ExposedDropdownMenu(expanded = open, onDismissRequest = { open = false }) {
                for (currency in currencies) {
                    DropdownMenuItem(
                        text = { Text("${currency.name} (${currency.code})") },
                        onClick = {
                            open = false
                            if (currency.code != selected) onSelect(currency.code)
                        },
                    )
                }
            }
        }
    }
}

/** An amount typed by hand: a figure in ASCII, never a formatted sentence. */
@Composable
internal fun AmountField(
    label: String,
    tag: String,
    value: String,
    onChange: (String) -> Unit,
) {
    val shape = RoundedCornerShape(RatesMetrics.fieldRadius)

    Column(modifier = Modifier.fillMaxWidth()) {
        RatesLabel(label)
        Spacer(Modifier.height(RatesMetrics.labelGap))
        Box(
            modifier =
                Modifier.testTag(tag)
                    .fillMaxWidth()
                    .height(RatesMetrics.fieldHeight)
                    .clip(shape)
                    .background(RoyColors.background.copy(alpha = 0.8f))
                    .border(1.dp, RoyColors.input.copy(alpha = 0.8f), shape)
                    .semantics { contentDescription = label }
                    .padding(horizontal = RatesMetrics.fieldPadding),
            contentAlignment = Alignment.CenterStart,
        ) {
            BasicTextField(
                value = value,
                onValueChange = onChange,
                singleLine = true,
                textStyle = TextStyle(fontSize = RatesMetrics.fieldTextSize, color = RoyColors.foreground),
                cursorBrush = SolidColor(RoyColors.primary),
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                modifier = Modifier.fillMaxWidth(),
            )
        }
    }
}

/** One label over a row of choices: the site's segmented control, drawn at its 42 high. */
@Composable
internal fun ChoiceRow(
    label: String,
    options: List<Pair<String, String>>,
    selected: String,
    onSelect: (String) -> Unit,
) {
    Column(modifier = Modifier.fillMaxWidth()) {
        RatesLabel(label)
        Spacer(Modifier.height(RatesMetrics.choiceLabelGap))

        Row(
            modifier =
                Modifier.fillMaxWidth()
                    .height(RatesMetrics.trackHeight)
                    .clip(RoundedCornerShape(RatesMetrics.trackRadius))
                    .background(RoyColors.muted.copy(alpha = 0.7f))
                    .border(
                        RatesMetrics.trackBorder,
                        RoyColors.border.copy(alpha = 0.6f),
                        RoundedCornerShape(RatesMetrics.trackRadius),
                    )
                    .padding(
                        RatesMetrics.trackPadding + RatesMetrics.trackBorder,
                    ),
            horizontalArrangement = Arrangement.spacedBy(0.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            for ((value, text) in options) {
                val isSelected = value == selected
                Box(
                    modifier =
                        Modifier.weight(1f)
                            .height(RatesMetrics.trackItemHeight)
                            .clip(RoundedCornerShape(RatesMetrics.trackItemRadius))
                            .background(
                                if (isSelected) RoyColors.selected else RoyColors.muted.copy(alpha = 0f),
                            )
                            .selectable(
                                selected = isSelected,
                                role = Role.RadioButton,
                                onClick = { if (!isSelected) onSelect(value) },
                            ),
                    contentAlignment = Alignment.Center,
                ) {
                    Text(
                        text = text,
                        style = TextStyle(
                            fontSize = RatesMetrics.fieldTextSize,
                            fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Normal,
                        ),
                        color = if (isSelected) RoyColors.selectedForeground else RoyColors.mutedForeground,
                        maxLines = 1,
                    )
                }
            }
        }
    }
}

/** The site's card surface for a converter. */
@Composable
internal fun RatesCard(
    tag: String,
    modifier: Modifier = Modifier,
    content: @Composable ColumnScope.() -> Unit,
) {
    val shape = RoundedCornerShape(RatesMetrics.cardRadius)

    Column(
        modifier =
            modifier.testTag(tag)
                .fillMaxWidth()
                .clip(shape)
                .background(RoyColors.card.copy(alpha = 0.85f))
                .border(1.dp, RoyColors.border.copy(alpha = 0.6f), shape)
                .padding(RatesMetrics.cardContentPadding),
    ) {
        content()
    }
}

/** The site's `عكس الاتِّجاه`: the same two currencies, swapped. */
@Composable
internal fun SwapButton(modifier: Modifier = Modifier, onClick: () -> Unit) {
    Surface(
        onClick = onClick,
        modifier = modifier.width(RatesMetrics.swapSize).height(RatesMetrics.swapSize),
        shape = RoundedCornerShape(RatesMetrics.fieldRadius),
        color = RoyColors.muted.copy(alpha = 0.5f),
        border = BorderStroke(1.dp, RoyColors.input.copy(alpha = 0.8f)),
    ) {
        Box(contentAlignment = Alignment.Center) {
            Icon(
                imageVector = LucideVectors.ArrowUpDown,
                contentDescription = RatesConverterCopy.SWAP,
                tint = RoyColors.primary,
                modifier = Modifier.size(Recipes.Glyph.sm),
            )
        }
    }
}
