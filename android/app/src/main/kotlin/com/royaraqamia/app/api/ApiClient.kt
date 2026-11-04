package com.royaraqamia.app.api

import com.royaraqamia.app.contracts.ApiError
import com.royaraqamia.app.contracts.ApiResult
import com.royaraqamia.app.contracts.ContractCodec
import com.royaraqamia.app.net.HttpResponse
import com.royaraqamia.app.net.HttpTransport
import com.royaraqamia.app.net.Transport
import com.royaraqamia.app.session.Session
import com.royaraqamia.app.update.ShellUpdateChannel
import com.royaraqamia.app.update.ShellUpdateRequired
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.KSerializer
import kotlinx.serialization.serializer
import java.io.IOException

/** What one attempt to send a request came to. */
private sealed interface Answer {
    data class Sent(val response: HttpResponse) : Answer
    data class Unreachable(val detail: String) : Answer
}

/**
 * The app's way to an owned route (#501): the bearer the request sends, the one
 * refresh a 401 is allowed, and the decode the caller asked for.
 *
 * The rule this class exists for is **one retry, never two**. A server answers
 * 401 to an expired access token, so the client refreshes and sends the request
 * again — once. If the second answer is 401 as well, the token is not the
 * problem, and retrying is how a client ends up in a request loop that outlives
 * the screen that started it. The refresh itself is single-flight in [Session],
 * so ten screens waking at the same moment spend one refresh token, not ten.
 *
 * The response body is decoded through [ContractCodec] rather than cast, so a
 * server that drifted is [ApiError.InvalidContract] naming the field instead of a
 * screen reading `null` as a number. Errors are values: the caller is a screen,
 * and a screen renders them.
 *
 * [send] is the write half (#650): the same bearer, the same one refresh and the
 * same status handling, but the caller is an Outbox replay that wants the answer
 * rather than a decoded body. A body the drainer cannot decode must not fail a
 * write the server already accepted, so that path returns the raw text and lets
 * the status decide.
 */
class ApiClient(
    private val baseUrl: String,
    private val session: Session,
    private val transport: Transport = HttpTransport,
) {
    suspend fun <T> get(path: String, serializer: KSerializer<T>): ApiResult<T> =
        decodeAfter("GET", path, null, serializer)

    /**
     * A `DELETE`, through the same bearer, the same one refresh and the same
     * decode as [get]. Revocation is the first write the app sends (#657): the
     * answer is a body like any other, so the client decodes it instead of
     * guessing success from the status.
     */
    suspend fun <T> delete(path: String, serializer: KSerializer<T>): ApiResult<T> =
        decodeAfter("DELETE", path, null, serializer)

    /**
     * A `POST` whose answer the caller draws (#819).
     *
     * The difference from [send] is what the caller wants back: a chat's write is
     * answered with the row as it now stands (a message, a thread, a sentence of
     * refusal), so it is decoded through the generated contract rather than left
     * as text. [send] stays the Outbox's, which only needs "the server took it".
     */
    suspend fun <T> post(path: String, body: String?, serializer: KSerializer<T>): ApiResult<T> =
        decodeAfter("POST", path, body, serializer)

    /** A `PATCH` on the same path as [post]: an edited message is answered whole. */
    suspend fun <T> patch(path: String, body: String?, serializer: KSerializer<T>): ApiResult<T> =
        decodeAfter("PATCH", path, body, serializer)

    /** A `PUT`, for the routes whose write replaces the whole record (the news checklist). */
    suspend fun <T> put(path: String, body: String?, serializer: KSerializer<T>): ApiResult<T> =
        decodeAfter("PUT", path, body, serializer)

    /**
     * One write, answered as its raw body (#650).
     *
     * The body is not decoded because the caller is the Outbox: what it needs to
     * know is "the server took it", and a decode failure on a 2xx would turn a
     * delivered write into a retried one. `body` is the intent's payload, already
     * encoded by the generated contract type that made it.
     */
    suspend fun send(method: String, path: String, body: String? = null): ApiResult<String> =
        withContext(Dispatchers.IO) {
            when (val answer = exchange(method, path, body)) {
                is ApiResult.Success -> ApiResult.Success(answer.value.body)
                is ApiResult.Failure -> answer
            }
        }

    private suspend fun <T> decodeAfter(
        method: String,
        path: String,
        body: String?,
        serializer: KSerializer<T>,
    ): ApiResult<T> =
        withContext(Dispatchers.IO) {
            when (val answer = exchange(method, path, body)) {
                is ApiResult.Success -> ContractCodec.decode(answer.value.body, serializer)
                is ApiResult.Failure -> answer
            }
        }

    /**
     * The request itself: the token, one refresh on 401, and the status split.
     *
     * Everything a caller can do with the result is either "decode this body" or
     * "this is the answer", so the exchange stops at the `HttpResponse` and the
     * two public shapes above decide what to make of it.
     */
    private suspend fun exchange(method: String, path: String, body: String?): ApiResult<HttpResponse> {
        val sent = session.attempt() ?: return ApiResult.Failure(ApiError.NotSignedIn)

        val first = send(method, path, sent.accessToken, body)
        if (first is Answer.Unreachable) {
            return ApiResult.Failure(ApiError.Network(first.detail))
        }

        var answered = (first as Answer.Sent).response
        if (answered.status == 401) {
            if (!session.renew(sent.generation)) {
                return ApiResult.Failure(ApiError.NotSignedIn)
            }
            val renewed = session.attempt() ?: return ApiResult.Failure(ApiError.NotSignedIn)

            val retry = send(method, path, renewed.accessToken, body)
            if (retry is Answer.Unreachable) {
                return ApiResult.Failure(ApiError.Network(retry.detail))
            }
            answered = (retry as Answer.Sent).response
        }

        if (answered.status == 401) {
            // Refreshed once and still refused: the token is not the problem,
            // so there is nothing left to retry — only a sign-in. Answering
            // `Server(401)` here would offer a screen an error it cannot act on.
            return ApiResult.Failure(ApiError.NotSignedIn)
        }

        if (answered.status !in 200..299) {
            // A build below the site's floor is answered `426` with the floor in
            // the body (#652). The card that installs a newer APK is the shell's,
            // not a screen's, so the number is published to it rather than turned
            // into an error no screen can act on — and the caller still gets the
            // failure, because the request itself did fail.
            if (answered.status == ShellUpdateRequired.STATUS) {
                ShellUpdateChannel.require(ShellUpdateRequired.floorOf(answered.body))
            }
            return ApiResult.Failure(
                ApiError.Server(answered.status, answered.body.take(MAX_DETAIL))
            )
        }

        return ApiResult.Success(answered)
    }

    /** [get] with the serializer taken from the type the caller asked for. */
    suspend inline fun <reified T> get(path: String): ApiResult<T> = get(path, serializer<T>())

    /** [delete] with the serializer taken from the type the caller asked for. */
    suspend inline fun <reified T> delete(path: String): ApiResult<T> = delete(path, serializer<T>())

    /** [post] with the serializer taken from the type the caller asked for. */
    suspend inline fun <reified T> post(path: String, body: String?): ApiResult<T> =
        post(path, body, serializer<T>())

    /** [patch] with the serializer taken from the type the caller asked for. */
    suspend inline fun <reified T> patch(path: String, body: String?): ApiResult<T> =
        patch(path, body, serializer<T>())

    /** [put] with the serializer taken from the type the caller asked for. */
    suspend inline fun <reified T> put(path: String, body: String?): ApiResult<T> =
        put(path, body, serializer<T>())

    private fun send(method: String, path: String, accessToken: String, body: String?): Answer =
        try {
            Answer.Sent(
                transport.send(
                    method = method,
                    url = urlFor(path),
                    headers =
                        if (body == null) {
                            mapOf("Authorization" to "Bearer $accessToken")
                        } else {
                            mapOf(
                                "Authorization" to "Bearer $accessToken",
                                "Content-Type" to "application/json",
                            )
                        },
                    body = body,
                )
            )
        } catch (error: IOException) {
            Answer.Unreachable(error.message ?: "unreachable")
        }

    /**
     * One public read (#658): the routes the site serves to a visitor, with no
     * bearer and no refresh. Rates and the certificate check are both here for the
     * same reason — a guest must be able to read them, and the difference is the
     * route's contract rather than the caller's luck.
     */
    suspend fun <T> getPublic(path: String, serializer: KSerializer<T>): ApiResult<T> =
        publicAfter("GET", path, null, serializer)

    /**
     * One public write (#658): the routes the site serves to a visitor, on the same
     * base URL and the same status split, with no bearer and no refresh.
     */
    suspend fun <T> postPublic(path: String, body: String, serializer: KSerializer<T>): ApiResult<T> =
        publicAfter("POST", path, body, serializer)

    /**
     * One public write, answered as its raw body (#929).
     *
     * The lead forms are public and anonymous: the Outbox must be able to replay
     * one with no session at all, and it reads the reference code out of the body
     * itself rather than turning a delivered lead into a retried one because a
     * field the app no longer expects appeared in the answer.
     */
    suspend fun sendPublic(method: String, path: String, body: String? = null): ApiResult<String> =
        withContext(Dispatchers.IO) {
            when (val answer = publicExchange(method, path, body)) {
                is ApiResult.Success -> ApiResult.Success(answer.value.body)
                is ApiResult.Failure -> answer
            }
        }

    /**
     * The public exchange: no token, no retry, the same status handling and decode.
     *
     * A `426` is published to the update channel exactly as the bearer path does,
     * because the floor applies to a guest too: an APK below it is answered by the
     * card wherever the request went.
     */
    private suspend fun <T> publicAfter(
        method: String,
        path: String,
        body: String?,
        serializer: KSerializer<T>,
    ): ApiResult<T> =
        withContext(Dispatchers.IO) {
            when (val answer = publicExchange(method, path, body)) {
                is ApiResult.Success -> ContractCodec.decode(answer.value.body, serializer)
                is ApiResult.Failure -> answer
            }
        }

    /** The public exchange itself: no token, no retry, the same status split. */
    private suspend fun publicExchange(
        method: String,
        path: String,
        body: String?,
    ): ApiResult<HttpResponse> =
        withContext(Dispatchers.IO) {
            val answered =
                try {
                    transport.send(
                        method = method,
                        url = urlFor(path),
                        headers =
                            if (body == null) emptyMap()
                            else mapOf("Content-Type" to "application/json"),
                        body = body,
                    )
                } catch (error: IOException) {
                    return@withContext ApiResult.Failure(
                        ApiError.Network(error.message ?: "unreachable")
                    )
                }

            if (answered.status !in 200..299) {
                if (answered.status == ShellUpdateRequired.STATUS) {
                    ShellUpdateChannel.require(ShellUpdateRequired.floorOf(answered.body))
                }
                return@withContext ApiResult.Failure(
                    ApiError.Server(answered.status, answered.body.take(MAX_DETAIL))
                )
            }

            ApiResult.Success(answered)
        }

    /** [getPublic] with the serializer taken from the type the caller asked for. */
    suspend inline fun <reified T> getPublic(path: String): ApiResult<T> =
        getPublic(path, serializer<T>())

    /** [postPublic] with the serializer taken from the type the caller asked for. */
    suspend inline fun <reified T> postPublic(path: String, body: String): ApiResult<T> =
        postPublic(path, body, serializer<T>())

    private fun urlFor(path: String): String = "${baseUrl.trimEnd('/')}/${path.trimStart('/')}"

    private companion object {
        /** Enough of an error body to read, never enough to fill a log line. */
        const val MAX_DETAIL = 300
    }
}
