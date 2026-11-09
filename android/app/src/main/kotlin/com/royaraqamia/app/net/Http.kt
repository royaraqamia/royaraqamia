package com.royaraqamia.app.net

import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL

/**
 * What one request got back: the status, and the body as bytes (an error body
 * included).
 *
 * The body is kept as bytes because one read is an image and one write is a file
 * (#945). [body] is the same bytes decoded as UTF-8, which is what every JSON
 * route and every error sentence is.
 */
class HttpResponse(val status: Int, val bytes: ByteArray) {
    constructor(status: Int, body: String) : this(status, body.toByteArray(Charsets.UTF_8))

    val body: String
        get() = bytes.toString(Charsets.UTF_8)
}

/**
 * One request out, synchronously (#501, ADR-0089's "one HTTP client").
 *
 * The interface exists so the client's *policy* — the bearer, the one refresh a
 * 401 is allowed, the decode — can be tested without a socket, and so the socket
 * itself stays a single small object with no branching in it: a connect timeout,
 * a read timeout, no surprise redirects, and the error body read from the stream
 * the connection actually used.
 *
 * A request that never reached an answer throws [IOException] to its caller
 * rather than returning a fake status, because only the caller knows whether
 * that is a retry (a screen) or a failed refresh (the session).
 *
 * [sendBytes] is the same request with a body of bytes (#945): the account's
 * avatar upload is `multipart/form-data`, which cannot be spelled as a string
 * without corrupting every byte above 127. A transport that only speaks text
 * leaves it to the default, which refuses rather than sending something the
 * caller did not mean.
 */
fun interface Transport {
    fun send(method: String, url: String, headers: Map<String, String>, body: String?): HttpResponse

    fun sendBytes(
        method: String,
        url: String,
        headers: Map<String, String>,
        body: ByteArray?,
    ): HttpResponse =
        throw UnsupportedOperationException("this transport speaks text only")
}

/** The transport the app ships: `HttpURLConnection`, with the timeouts it must not omit. */
object HttpTransport : Transport {
    private const val CONNECT_TIMEOUT_MS = 10_000
    private const val READ_TIMEOUT_MS = 20_000

    override fun send(
        method: String,
        url: String,
        headers: Map<String, String>,
        body: String?,
    ): HttpResponse = sendBytes(method, url, headers, body?.toByteArray(Charsets.UTF_8))

    override fun sendBytes(
        method: String,
        url: String,
        headers: Map<String, String>,
        body: ByteArray?,
    ): HttpResponse {
        val connection = URL(url).openConnection() as HttpURLConnection
        try {
            connection.requestMethod = method
            connection.connectTimeout = CONNECT_TIMEOUT_MS
            connection.readTimeout = READ_TIMEOUT_MS
            // A redirect is an answer, not something to follow with an
            // Authorization header: the token is for our origin only.
            connection.instanceFollowRedirects = false
            connection.setRequestProperty("Accept", "application/json")
            headers.forEach { (name, value) -> connection.setRequestProperty(name, value) }

            if (body != null) {
                connection.doOutput = true
                connection.outputStream.use { it.write(body) }
            }

            val status = connection.responseCode
            val stream = if (status in 200..299) connection.inputStream else connection.errorStream
            val bytes = stream?.use { it.readBytes() } ?: ByteArray(0)

            return HttpResponse(status, bytes)
        } finally {
            connection.disconnect()
        }
    }
}
