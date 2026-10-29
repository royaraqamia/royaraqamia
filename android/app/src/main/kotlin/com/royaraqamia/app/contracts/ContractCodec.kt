package com.royaraqamia.app.contracts

import kotlinx.serialization.KSerializer
import kotlinx.serialization.SerializationException
import kotlinx.serialization.json.Json
import kotlinx.serialization.serializer

/**
 * Turns a response body into a generated contract type, or into a typed failure
 * (ADR-0089, #648).
 *
 * The two settings are contract policy, not preference:
 *
 * - `ignoreUnknownKeys` — adding an optional field to a Zod schema must not
 *   break an app that shipped before it. A *removed or renamed* field is a
 *   different matter: the generated type no longer has the property, so the
 *   Kotlin that read it stops compiling.
 * - `explicitNulls = false` — a `null` where the schema allows it decodes to
 *   the property's default instead of failing.
 */
object ContractCodec {
    @PublishedApi
    internal val json = Json {
        ignoreUnknownKeys = true
        explicitNulls = false
    }

    inline fun <reified T> decode(body: String): ApiResult<T> =
        decode(body, serializer<T>())

    fun <T> decode(body: String, serializer: KSerializer<T>): ApiResult<T> =
        try {
            ApiResult.Success(json.decodeFromString(serializer, body))
        } catch (error: SerializationException) {
            ApiResult.Failure(ApiError.InvalidContract(fieldOf(error), error.message ?: "unreadable"))
        } catch (error: IllegalArgumentException) {
            // kotlinx throws this for a few shape mismatches instead of a
            // SerializationException; both mean the same thing to a screen.
            ApiResult.Failure(ApiError.InvalidContract(fieldOf(error), error.message ?: "unreadable"))
        }

    /**
     * The field the decoder objected to, when it names one. A missing field
     * reports the field itself (`plan`); a wrong value reports the path to it
     * (`$.state.counters[0].window`).
     */
    private fun fieldOf(error: Throwable): String? {
        val message = error.message ?: ""
        return MISSING.find(message)?.groupValues?.getOrNull(1)
            ?: PATH.find(message)?.groupValues?.getOrNull(1)
    }

    private val PATH = Regex("""at path: (\S+)""")
    private val MISSING = Regex("""Field '([^']+)' is required""")
}
