package com.royaraqamia.app.rates

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExposedDropdownMenuBox
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.MenuAnchorType
import androidx.compose.material3.OutlinedTextField
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
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.royaraqamia.app.contracts.generated.RatesBoard
import com.royaraqamia.app.contracts.generated.RatesBoardCurrenciesItem
import com.royaraqamia.app.theme.LocalRoySpacing
import com.royaraqamia.app.theme.LocalRoyTypeScale
import com.royaraqamia.app.theme.Recipes
import com.royaraqamia.app.theme.RoyColors
import com.royaraqamia.app.theme.RoyShape

/**
 * The site's `/rates` as a screen (#658).
 *
 * The page: its title, the day the numbers are quoted from, the stale badge when the
 * feed is behind, and the two converters the page draws — currencies, then gold and
 * silver. The screen owns what the page owns around them: the one read, and the
 * retry a failed one offers.
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
    val spacing = LocalRoySpacing.current
    val type = LocalRoyTypeScale.current

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

    Column(
        modifier =
            modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = spacing.elementGap, vertical = spacing.elementGapSm),
        verticalArrangement = Arrangement.spacedBy(spacing.elementGap),
    ) {
        Text(
            text = RatesPageCopy.PAGE_TITLE,
            modifier = Modifier.fillMaxWidth(),
            style = type.h2,
            color = RoyColors.primary,
            textAlign = TextAlign.Center,
        )

        when (val shown = state) {
            null -> Loading()
            is RatesUiState.Live -> Board(shown.board)
            is RatesUiState.Snapshot -> Board(shown.board)
            RatesUiState.Unavailable ->
                Unavailable(onRetry = { attempts += 1 })
        }
    }
}

/** The board's freshness line, its stale badge, and the two converters. */
@Composable
private fun Board(board: RatesBoard) {
    val type = LocalRoyTypeScale.current
    val spacing = LocalRoySpacing.current

    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(spacing.elementGapSm, Alignment.CenterHorizontally),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            text =
                "${RatesPageCopy.UPDATED_LABEL} ${RatesFormat.hijri(board.providerQuoteDate)} — " +
                    RatesFormat.gregorian(board.providerQuoteDate),
            style = type.xs,
            color = Recipes.Row.labelColor,
        )
        if (board.isStale) {
            Surface(
                shape = Recipes.Badge.radius,
                color = RoyColors.warning.copy(alpha = 0.1f),
                border = BorderStroke(1.dp, RoyColors.warning.copy(alpha = 0.3f)),
            ) {
                Text(
                    text = RatesPageCopy.STALE_BADGE,
                    modifier =
                        Modifier.padding(
                            horizontal = LocalRoySpacing.current.elementGapSm,
                            vertical = 2.dp,
                        ),
                    style = type.xs.copy(fontWeight = FontWeight.Bold),
                    color = RoyColors.warning,
                )
            }
        }
    }

    RatesConverterCard(board)
    RatesMetalsCard(board)
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
    val type = LocalRoyTypeScale.current
    val spacing = LocalRoySpacing.current

    Column(
        modifier = Modifier.fillMaxWidth().clickable(onClick = onRetry),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(spacing.elementGapSm),
    ) {
        Text(
            text = RatesPageCopy.FAILURE_BODY,
            style = type.small,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            textAlign = TextAlign.Center,
        )
    }
}

/** The site's result box: the figure and its currency, then the line that qualifies it. */
@Composable
internal fun RatesResultBox(
    conversion: Conversion?,
    targetCode: String,
    oldLiraAmount: Double?,
    basisCaption: String?,
    staleMarketAsOf: String?,
    copy: RatesResultCopy,
) {
    val type = LocalRoyTypeScale.current
    val spacing = LocalRoySpacing.current

    Column(
        modifier =
            Modifier.fillMaxWidth()
                .background(RoyColors.primary.copy(alpha = 0.05f), RoyShape.card)
                .padding(spacing.elementGap),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(spacing.elementGapSm),
    ) {
        if (conversion == null) {
            Text(text = copy.emptyResult, style = type.h3, color = Recipes.Row.labelColor)
            Text(
                text = copy.noConversion,
                style = type.xs,
                color = RoyColors.destructive,
                textAlign = TextAlign.Center,
            )
            return@Column
        }

        Row(
            horizontalArrangement = Arrangement.spacedBy(spacing.elementGapSm / 2f),
            verticalAlignment = Alignment.Bottom,
        ) {
            Text(
                text = if (targetCode == "SYP") copy.newLira else RatesFormat.symbol(targetCode),
                style = type.xs,
                color = Recipes.Row.labelColor,
            )
            Text(
                text = RatesFormat.value(conversion.result),
                style = type.h2.copy(fontWeight = FontWeight.Bold),
                color = RoyColors.primary,
            )
        }

        if (oldLiraAmount != null) {
            Text(
                text = "${RatesFormat.value(oldLiraAmount)} ${copy.oldLira}",
                style = type.xs,
                color = Recipes.Row.labelColor,
            )
        } else if (basisCaption != null) {
            Text(text = basisCaption, style = type.xs, color = Recipes.Row.labelColor)
        }

        if (staleMarketAsOf != null) {
            Text(
                text =
                    "${copy.stalePrefix} ${RatesFormat.hijri(staleMarketAsOf)} — " +
                        RatesFormat.gregorian(staleMarketAsOf),
                style = type.xs,
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

/** A currency picker over the board's own list: the currencies the site's control offers. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun CurrencyField(
    label: String,
    selected: String,
    currencies: List<RatesBoardCurrenciesItem>,
    onSelect: (String) -> Unit,
) {
    var open by remember { mutableStateOf(false) }
    val current = currencies.firstOrNull { it.code == selected }

    ExposedDropdownMenuBox(expanded = open, onExpandedChange = { open = it }) {
        OutlinedTextField(
            value = if (current == null) selected else "${current.name} (${current.code})",
            onValueChange = {},
            readOnly = true,
            singleLine = true,
            label = { Text(label) },
            modifier =
                Modifier.fillMaxWidth()
                    .semantics { contentDescription = label }
                    .menuAnchor(MenuAnchorType.PrimaryNotEditable, enabled = true),
        )
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

/** One label over a row of choices: the site's segmented control, as chips. */
@Composable
internal fun ChoiceRow(
    label: String,
    options: List<Pair<String, String>>,
    selected: String,
    onSelect: (String) -> Unit,
) {
    val type = LocalRoyTypeScale.current
    val spacing = LocalRoySpacing.current

    Column(
        modifier = Modifier.fillMaxWidth(),
        verticalArrangement = Arrangement.spacedBy(spacing.elementGapSm / 2f),
    ) {
        Text(text = label, style = type.xs, color = Recipes.Row.labelColor)
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(spacing.elementGapSm),
        ) {
            for ((value, text) in options) {
                FilterChip(
                    selected = value == selected,
                    onClick = { if (value != selected) onSelect(value) },
                    label = { Text(text, style = type.xs) },
                )
            }
        }
    }
}

/** An amount typed by hand: a figure in ASCII, never a formatted sentence. */
@Composable
internal fun AmountField(label: String, value: String, onChange: (String) -> Unit) {
    OutlinedTextField(
        value = value,
        onValueChange = onChange,
        singleLine = true,
        label = { Text(label) },
        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
        modifier = Modifier.fillMaxWidth(),
    )
}

/** The site's card surface for a converter. */
@Composable
internal fun RatesCard(modifier: Modifier = Modifier, content: @Composable () -> Unit) {
    val spacing = LocalRoySpacing.current

    Surface(
        modifier = modifier.fillMaxWidth(),
        shape = RoyShape.card,
        color = RoyColors.card.copy(alpha = 0.85f),
        border = BorderStroke(1.dp, RoyColors.border.copy(alpha = 0.6f)),
    ) {
        Column(
            modifier = Modifier.padding(Recipes.Card.padding(spacing)),
            verticalArrangement = Arrangement.spacedBy(spacing.elementGap),
            content = { content() },
        )
    }
}
