package com.royaraqamia.app.support

import com.royaraqamia.app.net.HttpResponse
import com.royaraqamia.app.net.Transport

/** One request as the transport was asked to send it. */
data class SentRequest(
    val method: String,
    val url: String,
    val headers: Map<String, String>,
    val body: String?,
) {
    /** The bearer an `Authorization` header carried, if any. */
    val bearer: String?
        get() = headers.entries.firstOrNull { it.key.equals("Authorization", true) }?.value
}

/**
 * The transport a test drives instead of a socket (#501).
 *
 * What is under test in `ApiClient` and the refresher is policy — which header,
 * one refresh, one retry, which answers are refusals — and none of that needs a
 * port. The socket itself is `HttpTransport`, one object with no branching, and
 * what it exists to get right (timeouts, no redirect with a token attached) is
 * written there rather than proven by a fake.
 */
class RecordingTransport(private val answer: (SentRequest) -> HttpResponse) : Transport {
    private val recorded = mutableListOf<SentRequest>()

    val requests: List<SentRequest>
        get() = synchronized(recorded) { recorded.toList() }

    /** How many requests were sent — the number a "one retry" test counts. */
    val hits: Int
        get() = synchronized(recorded) { recorded.size }

    override fun send(
        method: String,
        url: String,
        headers: Map<String, String>,
        body: String?,
    ): HttpResponse {
        val request = SentRequest(method, url, headers, body)
        synchronized(recorded) { recorded.add(request) }
        return answer(request)
    }
}
