package com.royaraqamia.app.net

import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL

/** What one request got back: the status, and the body (an error body included). */
data class HttpResponse(val status: Int, val body: String)

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
 */
fun interface Transport {
    fun send(method: String, url: String, headers: Map<String, String>, body: String?): HttpResponse
}

/** The transport the app ships: `HttpURLConnection`, with the timeouts it must not omit. */
object HttpTransport : Transport {
    private const val CONNECT_TIMEOUT_MS = 10_000
    private const val READ_TIMEOUT_MS = 20_000

    override fun send(method: String, url: String, headers: Map<String, String>, body: String?): HttpResponse {
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
                connection.outputStream.use { it.write(body.toByteArray(Charsets.UTF_8)) }
            }

            val status = connection.responseCode
            val stream = if (status in 200..299) connection.inputStream else connection.errorStream
            val text = stream?.bufferedReader(Charsets.UTF_8)?.use { it.readText() } ?: ""

            return HttpResponse(status, text)
        } finally {
            connection.disconnect()
        }
    }
}
