package com.royaraqamia.app.rates

import com.royaraqamia.app.contracts.generated.RatesBoard
import com.royaraqamia.app.contracts.generated.RatesBoardCurrenciesItemParallelMarketsItem

/** Which price a dual-rate currency is quoted on, as `RATE_BASES` is on the site. */
enum class RateBasis {
    Official,
    Parallel,
    ;

    companion object {
        fun of(value: String): RateBasis = if (value == "parallel") Parallel else Official
    }
}

/**
 * The board's numbers, as a lookup the converter can ask (#658).
 *
 * `base` is the board's own base (USD); `rates` are units per base, `parallel` the
 * market value where one exists, and `metals` the ounce price in USD. It is the
 * app's copy of `RateLookup` in `shared/rates.ts`, built the same way from the
 * same board, because the screen converts with arithmetic and arithmetic is the
 * one thing a "second client" cannot generate from a contract.
 */
data class RateLookup(
    val base: String,
    val rates: Map<String, Double>,
    val parallel: Map<String, Double>,
    val metals: Map<String, Double>,
)

/** What one conversion came to: the converted amount, and the rate it used. */
data class Conversion(val result: Double, val rate: Double)

/**
 * The site's conversion arithmetic, in the app (#658).
 *
 * This is a port of `shared/rates.ts`, `frontend/ui/rates/rate-lookup.ts` and
 * `frontend/ui/rates/rates-defaults.ts`, and it is a copy on purpose: the server
 * sends a board, not a converted number, so both clients do the same arithmetic
 * on the same rows. What keeps the two honest is
 * `shared/fixtures/parity/rates-board.json` — the same board, the same cases and
 * the same expected numbers, asserted by a vitest suite and by `RatesMathTest`
 * (ADR-0098). A doubled or inverted rate on either side is a red test, not a
 * number a visitor has to notice.
 *
 * Every rule the site applies is here rather than in the screen, so the screen
 * cannot apply a different one:
 *
 * - a metal is priced per gram from its ounce price, and gold alone is scaled by
 *   its karat;
 * - a fiat code is `1 / rate`, and the base is 1;
 * - the parallel basis falls back to the official value for a code that has no
 *   market rate, which is what makes a mixed pair (parallel SYP to official SAR)
 *   possible at all;
 * - a market that spans several quotes (YER) is resolved to the chosen one, or to
 *   the first when none was chosen.
 */
object RatesMath {
    /** The troy ounce in grams: the site's `TROY_OUNCE_GRAMS`. */
    const val TROY_OUNCE_GRAMS = 31.1034768

    /** Gold, the only metal a karat applies to. */
    const val GOLD = "XAU"

    /** The metals the site treats as metals for conversion (`METAL_CODES`). */
    val metalCodes: Set<String> = setOf("XAU", "XAG")

    fun isMetal(code: String): Boolean = metalCodes.contains(code)

    /** The lookup for one board, resolving each dual-rate code to [activeMarket]. */
    fun buildLookup(board: RatesBoard, activeMarket: String? = null): RateLookup {
        val parallel = mutableMapOf<String, Double>()
        for (currency in board.currencies) {
            val market = currency.parallel ?: continue
            val markets = currency.parallelMarkets.orEmpty()
            val chosen =
                if (markets.isEmpty()) null
                else markets.firstOrNull { it.key == activeMarket } ?: markets.first()
            parallel[currency.code] = chosen?.rate?.rate ?: market.rate
        }

        return RateLookup(
            base = board.base,
            rates = board.currencies.associate { it.code to it.rate },
            parallel = parallel,
            metals = board.metals.associate { it.code to it.pricePerOunceUsd },
        )
    }

    /**
     * The markets quoted for the first of [codes] that has more than one. A pair
     * that mentions YER offers Sanaa and Aden; every other pair offers nothing.
     */
    fun marketOptions(
        board: RatesBoard,
        codes: List<String>,
    ): List<RatesBoardCurrenciesItemParallelMarketsItem> =
        board.currencies
            .firstOrNull { currency ->
                codes.contains(currency.code) && !currency.parallelMarkets.isNullOrEmpty()
            }
            ?.parallelMarkets
            .orEmpty()

    /**
     * The oldest parallel quote day among [codes] that carry one (`YYYY-MM-DD`), or
     * null. Older than the board's provider quote date means the market value was
     * carried forward from an earlier sync (ADR-0014).
     */
    fun oldestParallelAsOf(board: RatesBoard, codes: List<String>): String? {
        var oldest: String? = null
        for (code in codes) {
            val asOf = board.currencies.firstOrNull { it.code == code }?.parallel?.asOf ?: continue
            if (oldest == null || asOf < oldest) oldest = asOf
        }
        return oldest
    }

    /** Whether the lookup holds a market value for [code]. */
    fun isParallelRate(lookup: RateLookup, code: String): Boolean {
        val value = lookup.parallel[code] ?: return false
        return value > 0
    }

    fun pricePerGram(pricePerOunce: Double): Double = pricePerOunce / TROY_OUNCE_GRAMS

    fun karatPricePerGram(pricePerOunce: Double, karat: Int): Double =
        pricePerGram(pricePerOunce) * (karat / 24.0)

    /** A unit of [code] in USD, or null when the board has no usable number for it. */
    fun usdPerUnit(
        lookup: RateLookup,
        code: String,
        basis: RateBasis = RateBasis.Official,
        karat: Int? = null,
    ): Double? {
        if (isMetal(code)) {
            val perOunce = lookup.metals[code] ?: return null
            if (perOunce <= 0) return null
            if (code == GOLD && karat != null) return karatPricePerGram(perOunce, karat)
            return pricePerGram(perOunce)
        }

        if (code == lookup.base) return 1.0

        val rate =
            if (basis == RateBasis.Parallel) {
                val parallel = lookup.parallel[code]
                if (parallel != null && parallel > 0) parallel else lookup.rates[code]
            } else {
                lookup.rates[code]
            }
        if (rate == null || rate <= 0) return null
        return 1 / rate
    }

    /** [amount] of [from] in [to], or null when either side cannot be priced. */
    fun convertAmount(
        lookup: RateLookup,
        from: String,
        to: String,
        amount: Double,
        basis: RateBasis = RateBasis.Official,
        karat: Int? = null,
    ): Conversion? {
        if (!amount.isFinite()) return null
        val fromUsd = usdPerUnit(lookup, from, basis, karat) ?: return null
        val toUsd = usdPerUnit(lookup, to, basis, karat) ?: return null
        if (toUsd == 0.0) return null

        val rate = fromUsd / toUsd
        return Conversion(result = amount * rate, rate = rate)
    }

    /** The day-over-day change, as the site's `computeChangePct`. */
    fun computeChangePct(current: Double, previous: Double?): Double? {
        if (previous == null || previous == 0.0) return null
        return ((current - previous) / previous) * 100
    }

    /**
     * The code the converter's "to" side starts on: the detected code when the
     * board quotes it, else SYP, else any quoted code other than the base.
     *
     * The site passes the visitor's country; the app passes the currency its locale
     * suggests, or null — the same function with one input the app cannot know.
     */
    fun resolveDefaultTarget(board: RatesBoard, detectedCode: String? = null): String {
        val codes = board.currencies.map { it.code }.toSet()
        if (detectedCode != null && codes.contains(detectedCode)) return detectedCode
        if (codes.contains("SYP")) return "SYP"
        return board.currencies.firstOrNull { it.code != board.base }?.code ?: board.base
    }

    /** The starting pair; "from" moves off the base when the visitor already uses it. */
    fun resolveDefaultPair(board: RatesBoard, detectedCode: String? = null): Pair<String, String> {
        val codes = board.currencies.map { it.code }.toSet()
        val to = resolveDefaultTarget(board, detectedCode)
        if (to != board.base) return board.base to to

        val from =
            if (codes.contains("SYP")) "SYP"
            else board.currencies.firstOrNull { it.code != board.base }?.code ?: board.base
        return from to board.base
    }
}
