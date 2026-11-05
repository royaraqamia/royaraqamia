package com.royaraqamia.app.rates

import androidx.compose.foundation.layout.Spacer
import androidx.compose.ui.Alignment
import androidx.compose.ui.platform.testTag
import androidx.compose.foundation.layout.height
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.royaraqamia.app.contracts.generated.RatesBoard

/**
 * The currency converter (#658, #897), the app's half of
 * `frontend/ui/rates/RatesExplorer.tsx`.
 *
 * One amount, two currencies, a way to swap them, and — only when the pair actually
 * needs it — the basis the rate is taken on and the market it is quoted in. Every
 * figure comes from [RatesMath] rather than from arithmetic written here, which is
 * what keeps the app and the page converting a pair the same way.
 *
 * The pair starts where the page starts it: the base on one side and the visitor's
 * own currency on the other, falling back to the pound. The app has no country
 * cookie, so it starts where a visitor with no country starts — and the two pickers
 * are right there.
 *
 * The card's second face is [RatesConverterState.NoConversion]: a pair or an amount
 * the board cannot price, which is the site's `تعذَّر التَّحويل بين هذين العنصرين.`
 * rather than a zero that looks like an answer.
 */
@Composable
fun RatesConverterCard(board: RatesBoard, modifier: Modifier = Modifier) {
    val default = RatesMath.resolveDefaultPair(board)
    var from by remember(board) { mutableStateOf(default.first) }
    var to by remember(board) { mutableStateOf(default.second) }
    var amount by remember(board) { mutableStateOf("1") }
    var parallel by remember(board) { mutableStateOf(true) }
    var market by remember(board) { mutableStateOf<String?>(null) }

    val markets = RatesMath.marketOptions(board, listOf(from, to))
    val activeMarket = markets.firstOrNull { it.key == market }?.key ?: markets.firstOrNull()?.key
    val lookup = RatesMath.buildLookup(board, activeMarket)

    val basisRelevant = RatesMath.isParallelRate(lookup, from) || RatesMath.isParallelRate(lookup, to)
    val basis = if (basisRelevant && parallel) RateBasis.Parallel else RateBasis.Official
    val marketRelevant = basisRelevant && parallel && markets.size > 1

    val typed = amount.trim().toDoubleOrNull()
    val conversion = typed?.let { RatesMath.convertAmount(lookup, from, to, it, basis) }
    val state =
        if (conversion == null) RatesConverterState.NoConversion else RatesConverterState.Ready

    val oldLira =
        when {
            conversion == null -> null
            to == "SYP" -> conversion.result * RatesFormat.OLD_SYP_PER_NEW_SYP
            from == "SYP" && typed != null -> typed * RatesFormat.OLD_SYP_PER_NEW_SYP
            else -> null
        }

    val marketAsOf = if (basisRelevant) RatesMath.oldestParallelAsOf(board, listOf(from, to)) else null
    val staleMarketAsOf =
        if (basis == RateBasis.Parallel && marketAsOf != null && marketAsOf < board.providerQuoteDate) {
            marketAsOf
        } else {
            null
        }

    val caption =
        when {
            !basisRelevant -> null
            basis == RateBasis.Parallel && marketRelevant ->
                markets.firstOrNull { it.key == activeMarket }?.name ?: RatesConverterCopy.BASIS_PARALLEL
            basis == RateBasis.Parallel -> RatesConverterCopy.BASIS_PARALLEL
            else -> RatesConverterCopy.BASIS_OFFICIAL
        }

    RatesCard(tag = RatesMetrics.CONVERTER, modifier = modifier) {
        AmountField(
            label = RatesConverterCopy.AMOUNT,
            tag = RatesMetrics.AMOUNT,
            value = amount,
            onChange = { amount = it },
        )

        Spacer(Modifier.height(RatesMetrics.fieldGap))

        CurrencyField(
            label = RatesConverterCopy.FROM,
            tag = RatesMetrics.FROM,
            selected = from,
            currencies = board.currencies,
            onSelect = { from = it },
        )

        Spacer(Modifier.height(RatesMetrics.fieldGap))

        SwapButton(modifier = Modifier.align(Alignment.CenterHorizontally)) {
            val previous = from
            from = to
            to = previous
        }

        Spacer(Modifier.height(RatesMetrics.fieldGap))

        CurrencyField(
            label = RatesConverterCopy.TO,
            tag = RatesMetrics.TO,
            selected = to,
            currencies = board.currencies,
            onSelect = { to = it },
        )

        if (basisRelevant) {
            Spacer(Modifier.height(RatesMetrics.fieldGap))
            ChoiceRow(
                label = RatesConverterCopy.RATE_LABEL,
                options =
                    listOf(
                        "parallel" to RatesConverterCopy.BASIS_PARALLEL,
                        "official" to RatesConverterCopy.BASIS_OFFICIAL,
                    ),
                selected = if (parallel) "parallel" else "official",
                onSelect = { parallel = it == "parallel" },
            )
        }

        if (marketRelevant) {
            Spacer(Modifier.height(RatesMetrics.fieldGap))
            ChoiceRow(
                label = RatesConverterCopy.MARKET,
                options = markets.map { it.key to it.name },
                selected = activeMarket.orEmpty(),
                onSelect = { market = it },
            )
        }

        Spacer(Modifier.height(RatesMetrics.resultGap))

        RatesResultBox(
            modifier = Modifier.testTag(RatesMetrics.RESULT),
            conversion = if (state == RatesConverterState.Ready) conversion else null,
            targetCode = to,
            oldLiraAmount = oldLira,
            basisCaption = caption,
            staleMarketAsOf = staleMarketAsOf,
            copy =
                RatesResultCopy(
                    newLira = RatesConverterCopy.NEW_LIRA,
                    oldLira = RatesConverterCopy.OLD_LIRA,
                    stalePrefix = RatesConverterCopy.STALE_PREFIX,
                    noConversion = RatesConverterCopy.NO_CONVERSION,
                    emptyResult = RatesConverterCopy.EMPTY_RESULT,
                ),
        )
    }
}
