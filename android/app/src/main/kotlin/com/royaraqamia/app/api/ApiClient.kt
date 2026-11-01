package com.royaraqamia.app.api

import com.royaraqamia.app.contracts.ApiError
import com.royaraqamia.app.contracts.ApiResult
import com.royaraqamia.app.contracts.ContractCodec
import com.royaraqamia.app.net.HttpResponse
import com.royaraqamia.app.net.HttpTransport
import com.royaraqamia.app.net.Transport
import com.royaraqamia.app.session.Session
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

    private fun send(method: String, path: String, accessToken: String, body: String?): Answer =
        try {
            Answer.Sent(
                transport.send(
                    method = method,
                    url = urlFor(path),
                    headers = mapOf("Authorization" to "Bearer $accessToken"),
                    body = body,
                )
            )
        } catch (error: IOException) {
            Answer.Unreachable(error.message ?: "unreachable")
        }

    private fun urlFor(path: String): String = "${baseUrl.trimEnd('/')}/${path.trimStart('/')}"

    private companion object {
        /** Enough of an error body to read, never enough to fill a log line. */
        const val MAX_DETAIL = 300
    }
}
