package com.royaraqamia.app.rates

import com.royaraqamia.app.api.ApiClient
import com.royaraqamia.app.contracts.ApiError
import com.royaraqamia.app.contracts.ApiResult
import com.royaraqamia.app.contracts.ContractCodec
import com.royaraqamia.app.contracts.generated.RatesBoard
import com.royaraqamia.app.store.PublicSnapshotStore

/** What the converter has to draw, and where it came from. */
sealed interface RatesResult {
    /** The board the server answered just now. */
    data class Live(val board: RatesBoard) : RatesResult

    /** The last board that was read, because this read could not be. */
    data class Snapshot(val board: RatesBoard) : RatesResult

    /** Neither: no answer, and nothing kept. [error] is why the read failed, when it did. */
    data class Unavailable(val error: ApiError?) : RatesResult
}

/**
 * The rates board, and the last one this device saw (#658).
 *
 * The board is public — a visitor reads it with no account — so the read goes out
 * with no bearer ([ApiClient.getPublic]), on the route the page's own loader
 * answers (`GET /api/rates/board`).
 *
 * The offline half is the shared public-surface rule (`docs/specs/offline-first.md`):
 * a failed read falls back to the last board kept in [PublicSnapshotStore] under
 * this surface's key, and only when there is none does the screen have nothing to
 * show. The distinction survives into [RatesResult] rather than being flattened
 * into a board with a flag, because the screen words it: a snapshot is "these
 * numbers, from when", not a silent substitution of yesterday for today.
 */
class RatesRepository(
    private val client: ApiClient,
    private val snapshot: PublicSnapshotStore,
) {
    suspend fun board(): RatesResult {
        var failure: ApiError? = null
        when (val result = client.getPublic<RatesBoard>(BOARD_PATH)) {
            is ApiResult.Success -> {
                // Stored, then shown: a read the server answered is what makes the
                // next offline visit honest, so it is kept before anything can fail.
                snapshot.save(SNAPSHOT_SURFACE, ContractCodec.encode(result.value))
                return RatesResult.Live(result.value)
            }
            is ApiResult.Failure -> failure = result.error
        }

        val kept = snapshot.read(SNAPSHOT_SURFACE) ?: return RatesResult.Unavailable(failure)
        return when (val decoded = ContractCodec.decode<RatesBoard>(kept)) {
            is ApiResult.Success -> RatesResult.Snapshot(decoded.value)
            // A snapshot the contract can no longer read is not a board: it is a
            // file from an older APK, and drawing half of it would be a lie.
            is ApiResult.Failure -> RatesResult.Unavailable(failure)
        }
    }

    companion object {
        const val BOARD_PATH = "/api/rates/board"

        /** The key this surface keeps its last-seen board under (#928). */
        const val SNAPSHOT_SURFACE = "rates"
    }
}
