package com.royaraqamia.app.rates

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import com.royaraqamia.app.contracts.generated.RatesBoard
import com.royaraqamia.app.theme.LocalRoySpacing
import com.royaraqamia.app.theme.LocalRoyTypeScale
import com.royaraqamia.app.theme.RoyColors

/**
 * The gold and silver converter (#658), the app's half of
 * `frontend/ui/rates/MetalConverter.tsx`.
 *
 * A metal, a number of grams, a currency to read it in, and — for gold alone — the
 * karat. One gram of gold is not one gram of 24-karat gold, so the karat is applied
 * by [RatesMath.usdPerUnit] rather than by the card: the site's rule is that only
 * `XAU` is scaled, and a second opinion here could disagree with the page.
 *
 * The card's second face is [RatesMetalsState.NoConversion]: a board with no price
 * for the chosen metal, which the site words as `تعذَّر التَّحويل بين هذين العنصرين.`
 */
@Composable
fun RatesMetalsCard(board: RatesBoard, modifier: Modifier = Modifier) {
    val type = LocalRoyTypeScale.current

    var metal by remember(board) { mutableStateOf(board.metals.firstOrNull { it.code == RatesMath.GOLD }?.code ?: board.metals.firstOrNull()?.code ?: RatesMath.GOLD) }
    var grams by remember(board) { mutableStateOf("1") }
    var to by remember(board) { mutableStateOf(RatesMath.resolveDefaultTarget(board)) }
    var parallel by remember(board) { mutableStateOf(true) }
    var market by remember(board) { mutableStateOf<String?>(null) }
    var karat by remember(board) { mutableStateOf(24) }

    val markets = RatesMath.marketOptions(board, listOf(to))
    val activeMarket = markets.firstOrNull { it.key == market }?.key ?: markets.firstOrNull()?.key
    val lookup = RatesMath.buildLookup(board, activeMarket)

    val basisRelevant = RatesMath.isParallelRate(lookup, to)
    val basis = if (basisRelevant && parallel) RateBasis.Parallel else RateBasis.Official
    val marketRelevant = basisRelevant && parallel && markets.size > 1
    val karatRelevant = metal == RatesMath.GOLD

    val typed = grams.trim().toDoubleOrNull()
    val conversion =
        typed?.let {
            RatesMath.convertAmount(
                lookup = lookup,
                from = metal,
                to = to,
                amount = it,
                basis = basis,
                karat = if (karatRelevant) karat else null,
            )
        }
    val state = if (conversion == null) RatesMetalsState.NoConversion else RatesMetalsState.Ready

    val oldLira =
        if (conversion != null && to == "SYP") conversion.result * RatesFormat.OLD_SYP_PER_NEW_SYP
        else null

    val marketAsOf = if (basisRelevant) RatesMath.oldestParallelAsOf(board, listOf(to)) else null
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
                markets.firstOrNull { it.key == activeMarket }?.name ?: RatesMetalsCopy.BASIS_PARALLEL
            basis == RateBasis.Parallel -> RatesMetalsCopy.BASIS_PARALLEL
            else -> RatesMetalsCopy.BASIS_OFFICIAL
        }

    Column(
        modifier = modifier.fillMaxWidth(),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(LocalRoySpacing.current.elementGapSm),
    ) {
        Text(
            text = RatesMetalsCopy.TITLE,
            style = type.h3.copy(fontWeight = FontWeight.Bold),
            color = RoyColors.primary,
            textAlign = TextAlign.Center,
        )

        RatesCard {
            if (board.metals.size > 1) {
                ChoiceRow(
                    label = RatesMetalsCopy.METAL,
                    options = board.metals.map { it.code to it.name },
                    selected = metal,
                    onSelect = { metal = it },
                )
            }

            AmountField(label = RatesMetalsCopy.GRAMS, value = grams, onChange = { grams = it })

            CurrencyField(
                label = RatesMetalsCopy.TO,
                selected = to,
                currencies = board.currencies,
                onSelect = { to = it },
            )

            if (basisRelevant) {
                ChoiceRow(
                    label = RatesMetalsCopy.RATE_LABEL,
                    options =
                        listOf(
                            "parallel" to RatesMetalsCopy.BASIS_PARALLEL,
                            "official" to RatesMetalsCopy.BASIS_OFFICIAL,
                        ),
                    selected = if (parallel) "parallel" else "official",
                    onSelect = { parallel = it == "parallel" },
                )
            }

            if (marketRelevant) {
                ChoiceRow(
                    label = RatesMetalsCopy.MARKET,
                    options = markets.map { it.key to it.name },
                    selected = activeMarket.orEmpty(),
                    onSelect = { market = it },
                )
            }

            if (karatRelevant) {
                ChoiceRow(
                    label = RatesMetalsCopy.KARAT,
                    options = listOf("24", "22", "21", "18").map { it to it },
                    selected = karat.toString(),
                    onSelect = { karat = it.toInt() },
                )
            }

            RatesResultBox(
                conversion = if (state == RatesMetalsState.Ready) conversion else null,
                targetCode = to,
                oldLiraAmount = oldLira,
                basisCaption = caption,
                staleMarketAsOf = staleMarketAsOf,
                copy =
                    RatesResultCopy(
                        newLira = RatesMetalsCopy.NEW_LIRA,
                        oldLira = RatesMetalsCopy.OLD_LIRA,
                        stalePrefix = RatesMetalsCopy.STALE_PREFIX,
                        noConversion = RatesMetalsCopy.NO_CONVERSION,
                        emptyResult = RatesMetalsCopy.EMPTY_RESULT,
                    ),
            )
        }
    }
}
