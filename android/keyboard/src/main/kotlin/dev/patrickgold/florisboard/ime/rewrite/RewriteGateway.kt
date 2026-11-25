/*
 * Copyright (C) 2026 royaraqamia
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

package dev.patrickgold.florisboard.ime.rewrite

import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.atomic.AtomicLong
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put

/** Mirrors the server's ceilings; the keyboard enforces them on both sides. */
internal const val REWRITE_MAX_INPUT_CHARS = 280
internal const val REWRITE_MAX_OUTPUT_CHARS = 280
internal const val REWRITE_TIMEOUT_MS = 5_000

/**
 * A one-use capability that only the rewrite button's click handler creates.
 *
 * The gateway will not open a connection without consuming a tapped capability,
 * so there is no code path from a keystroke, a focus change or a suggestion
 * refresh into the network. The JVM test pins this boundary with a fake
 * transport: zero requests without a tap, one with a tap, none on a replay.
 */
class RewriteTap internal constructor(val composingText: String, val id: Long) {
    companion object {
        private val sequence = AtomicLong(0)
        private val lock = Any()
        private var armedId: Long? = null

        /** Called only from the button's `onClick`; captures the text at that instant. */
        @JvmStatic
        fun fromComposing(composingText: String): RewriteTap = synchronized(lock) {
            val tap = RewriteTap(composingText, sequence.incrementAndGet())
            armedId = tap.id
            tap
        }

        internal fun consume(tap: RewriteTap): Boolean = synchronized(lock) {
            val armed = armedId ?: return false
            armedId = null
            armed == tap.id
        }
    }
}

sealed class RewriteResult {
    data class Suggestion(val text: String) : RewriteResult()
    object Failure : RewriteResult()
}

/** The only transport in the IME; replaceable so the boundary can be tested. */
internal interface RewriteTransport {
    fun post(endpoint: String, token: String, text: String): String?
}

internal class HttpRewriteTransport : RewriteTransport {
    override fun post(endpoint: String, token: String, text: String): String? {
        val connection = URL(endpoint).openConnection() as HttpURLConnection
        return try {
            connection.requestMethod = "POST"
            connection.connectTimeout = REWRITE_TIMEOUT_MS
            connection.readTimeout = REWRITE_TIMEOUT_MS
            connection.setRequestProperty("Authorization", "Bearer $token")
            connection.setRequestProperty("Content-Type", "application/json; charset=utf-8")
            connection.doOutput = true
            connection.outputStream.use { stream ->
                val body = buildJsonObject { put("text", text) }.toString()
                stream.write(body.toByteArray(Charsets.UTF_8))
            }
            if (connection.responseCode != HttpURLConnection.HTTP_OK) return null
            connection.inputStream.use { it.readBytes().toString(Charsets.UTF_8) }
        } catch (error: Exception) {
            null
        } finally {
            connection.disconnect()
        }
    }
}

/**
 * One bounded POST, made only from a tap. It sends the composing text and the
 * scoped credential, nothing else, and parses the one suggestion the server
 * allowed. Every refusal path leaves the editor untouched.
 */
internal class RewriteGateway(
    private val transport: RewriteTransport = HttpRewriteTransport(),
    private val endpoint: String,
) {
    fun rewrite(tap: RewriteTap?, token: String?): RewriteResult {
        if (tap == null || token.isNullOrBlank()) return RewriteResult.Failure
        if (tap.composingText.isBlank() || tap.composingText.length > REWRITE_MAX_INPUT_CHARS) {
            return RewriteResult.Failure
        }
        // The boundary assertion: no tap, no connection, ever.
        if (!RewriteTap.consume(tap)) return RewriteResult.Failure

        val body = transport.post(endpoint, token, tap.composingText) ?: return RewriteResult.Failure
        return try {
            val answer = Json.parseToJsonElement(body).jsonObject
            if (answer["success"]?.jsonPrimitive?.booleanOrNull != true) return RewriteResult.Failure
            val suggestion = answer["suggestion"]?.jsonPrimitive?.content?.trim().orEmpty()
            if (suggestion.isEmpty() || suggestion.length > REWRITE_MAX_OUTPUT_CHARS) {
                RewriteResult.Failure
            } else {
                RewriteResult.Suggestion(suggestion)
            }
        } catch (error: Exception) {
            RewriteResult.Failure
        }
    }
}
