package com.royaraqamia.app.home

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import com.royaraqamia.app.contracts.ApiError
import com.royaraqamia.app.contracts.ApiResult
import com.royaraqamia.app.shell.ServicesSheetCopy

/** Where the door's read stands. The strip only cares whether it has an answer. */
sealed interface HomeServicesStatus {
    data object Loading : HomeServicesStatus

    data object Ready : HomeServicesStatus

    /** The account read failed; the device's list is what is drawn, and a retry is offered. */
    data object Failed : HomeServicesStatus
}

/**
 * The homepage's apps as the app holds them (#1194, ADR-0146).
 *
 * The site's provider (`frontend/state/home-services-provider.tsx`) is the
 * design: the account's set when signed in, the device's list for a guest, and
 * the union of the two on the first sign-in, after which the device's list is
 * cleared so the next sign-in does not re-merge a stale strip.
 *
 * A write moves the list before the server answers and moves it back when the
 * server refuses: a toggle that waits on a round trip feels broken, and one that
 * stays moved after a refusal is a lie about what the next load will show. The
 * refused write's sentence is kept for the sheet to draw.
 *
 * The merge runs once per identity. [start] is called at launch after the session
 * has answered, and [identityChanged] when the signed-in identity moves; a second
 * call for the same identity is a no-op, so a recomposition or a resumed activity
 * cannot re-PUT the same set.
 */
class HomeServicesController(
    private val repository: HomeServicesRepository,
    private val guest: HomeServicesStore,
    private val signedIn: () -> Boolean,
    private val identityKey: () -> String,
) {
    var order by mutableStateOf<List<String>>(emptyList())
        private set

    var status by mutableStateOf<HomeServicesStatus>(HomeServicesStatus.Loading)
        private set

    /** The route whose write is in flight, or null; the sheet disables that one row. */
    var busy by mutableStateOf<String?>(null)
        private set

    /** The refused write's sentence, or null. */
    var error by mutableStateOf<String?>(null)
        private set

    /** The identity whose set is already reconciled, so a sign-in merges once. */
    private var reconciledFor: String? = null

    /** The launch path: the device's list for a guest, the account's for a member. */
    suspend fun start() {
        if (signedIn()) {
            reconcile()
        } else {
            order = HomeServicesCatalog.sanitize(guest.read())
            status = HomeServicesStatus.Ready
        }
    }

    /** The signed-in identity moved, or the app came back with a session. */
    suspend fun identityChanged() {
        if (!signedIn()) {
            reconciledFor = null
            order = HomeServicesCatalog.sanitize(guest.read())
            status = HomeServicesStatus.Ready
            return
        }
        reconcile()
    }

    /** The empty state's and the sheet's retry. */
    suspend fun retry() {
        if (signedIn()) {
            reconciledFor = null
            reconcile()
        } else {
            start()
        }
    }

    private suspend fun reconcile() {
        val key = identityKey()
        if (reconciledFor == key) return
        reconciledFor = key
        status = HomeServicesStatus.Loading

        when (val account = repository.read()) {
            is ApiResult.Failure -> {
                // The device knows something the server did not answer: draw that
                // rather than pretending the member has no apps (the site's rule).
                order = HomeServicesCatalog.sanitize(guest.read())
                status = HomeServicesStatus.Failed
            }
            is ApiResult.Success -> {
                val stored = HomeServicesCatalog.sanitize(guest.read())
                var next = HomeServicesCatalog.sanitize(account.value)

                if (stored.isNotEmpty()) {
                    next = HomeServicesCatalog.merge(next, stored)
                    // The device's list is cleared only once the account has it: a
                    // failed write keeps the merge for the next launch's retry.
                    if (repository.replace(next) is ApiResult.Success) {
                        guest.clear()
                    }
                }

                order = next
                status = HomeServicesStatus.Ready
            }
        }
    }

    /** Adds an app at the end of the strip, or removes it; a no-op while a write is in flight. */
    suspend fun toggle(route: String) {
        if (busy != null) return
        if (route !in HomeServicesCatalog.routes) return

        val previous = order
        val next =
            if (route in previous) {
                previous.filterNot { it == route }
            } else {
                previous + route
            }

        error = null
        order = next

        if (!signedIn()) {
            if (!guest.write(next)) {
                order = previous
                error = REFUSED
            }
            return
        }

        busy = route
        when (val result = repository.replace(next)) {
            is ApiResult.Success -> order = HomeServicesCatalog.sanitize(result.value)
            is ApiResult.Failure -> {
                order = previous
                error = messageOf(result.error)
            }
        }
        busy = null
    }

    private fun messageOf(error: ApiError): String =
        when (error) {
            // The body is the server's own sentence when it is the contract's
            // refusal shape; a proxy page or an empty body is not one, and the
            // sheet's sentence is what the member reads then.
            is ApiError.Server -> HomeServicesRepository.refusalOf(error.detail) ?: REFUSED
            is ApiError.Network -> REFUSED
            ApiError.NotSignedIn -> REFUSED
            is ApiError.InvalidContract -> REFUSED
        }

    private companion object {
        /** The sheet's own sentence, so a refused write says the same thing on both clients. */
        val REFUSED: String = ServicesSheetCopy.FAILED
    }
}
