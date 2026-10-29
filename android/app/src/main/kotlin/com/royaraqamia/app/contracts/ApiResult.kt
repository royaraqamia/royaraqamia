package com.royaraqamia.app.contracts

/**
 * What a call to the server resolves to (ADR-0089).
 *
 * A failure is a value, not an exception: a screen renders it, and a response
 * that does not match the contract is one of those failures rather than a crash.
 */
sealed interface ApiResult<out T> {
    data class Success<T>(val value: T) : ApiResult<T>

    data class Failure(val error: ApiError) : ApiResult<Nothing>
}

/**
 * Why a call failed, in terms a screen can show.
 *
 * [InvalidContract] means the body arrived but this client's contract cannot
 * read it — the server and the app disagree, which is exactly the drift the
 * generated types exist to catch. The alternative, an exception thrown on a
 * background thread, reaches the user as a blank screen or a crash.
 */
sealed interface ApiError {
    data class InvalidContract(val field: String?, val detail: String) : ApiError
}
