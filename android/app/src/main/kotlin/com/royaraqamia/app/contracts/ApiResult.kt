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
 *
 * The other three are the transport's answers (#501): the app had no token to
 * send, the server answered with a status, or the request never reached one.
 * They are separate cases rather than one message because the screen's next move
 * differs — sign in, show the server's own words, or offer a retry.
 */
sealed interface ApiError {
    data class InvalidContract(val field: String?, val detail: String) : ApiError

    /** No token to send: signed out, or a refresh the server refused. */
    data object NotSignedIn : ApiError

    /** The server answered, but not with success. */
    data class Server(val status: Int, val detail: String) : ApiError

    /** The request never reached an answer: no radio, a timeout, a closed socket. */
    data class Network(val detail: String) : ApiError
}
