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
 */
class ApiClient(
    private val baseUrl: String,
    private val session: Session,
    private val transport: Transport = HttpTransport,
) {
    suspend fun <T> get(path: String, serializer: KSerializer<T>): ApiResult<T> =
        withContext(Dispatchers.IO) {
            val sent = session.attempt() ?: return@withContext ApiResult.Failure(ApiError.NotSignedIn)

            val first = send(path, sent.accessToken)
            if (first is Answer.Unreachable) {
                return@withContext ApiResult.Failure(ApiError.Network(first.detail))
            }

            var answered = (first as Answer.Sent).response
            if (answered.status == 401) {
                if (!session.renew(sent.generation)) {
                    return@withContext ApiResult.Failure(ApiError.NotSignedIn)
                }
                val renewed =
                    session.attempt() ?: return@withContext ApiResult.Failure(ApiError.NotSignedIn)

                val retry = send(path, renewed.accessToken)
                if (retry is Answer.Unreachable) {
                    return@withContext ApiResult.Failure(ApiError.Network(retry.detail))
                }
                answered = (retry as Answer.Sent).response
            }

            if (answered.status == 401) {
                // Refreshed once and still refused: the token is not the problem,
                // so there is nothing left to retry — only a sign-in. Answering
                // `Server(401)` here would offer a screen an error it cannot act on.
                return@withContext ApiResult.Failure(ApiError.NotSignedIn)
            }

            if (answered.status !in 200..299) {
                return@withContext ApiResult.Failure(
                    ApiError.Server(answered.status, answered.body.take(MAX_DETAIL))
                )
            }

            ContractCodec.decode(answered.body, serializer)
        }

    /** [get] with the serializer taken from the type the caller asked for. */
    suspend inline fun <reified T> get(path: String): ApiResult<T> = get(path, serializer<T>())

    private fun send(path: String, accessToken: String): Answer =
        try {
            Answer.Sent(
                transport.send(
                    method = "GET",
                    url = urlFor(path),
                    headers = mapOf("Authorization" to "Bearer $accessToken"),
                    body = null,
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
