package com.royaraqamia.app.accountnews

import com.royaraqamia.app.api.ApiClient
import com.royaraqamia.app.contracts.ApiError
import com.royaraqamia.app.contracts.ApiResult
import com.royaraqamia.app.contracts.ContractCodec
import com.royaraqamia.app.contracts.generated.NewsOkResponse
import com.royaraqamia.app.contracts.generated.NewsPrivateSourcesResponse
import com.royaraqamia.app.contracts.generated.NewsPrivateSourcesResponseSourcesItem
import com.royaraqamia.app.contracts.generated.NewsSourceRequestResponse
import com.royaraqamia.app.contracts.generated.NewsSourceRequestResponseRequest
import com.royaraqamia.app.contracts.generated.NewsSourceRequestsResponse
import com.royaraqamia.app.contracts.generated.NewsSourceRequestsResponseRequestsItem
import com.royaraqamia.app.contracts.generated.NewsSourceSelectionResponse
import com.royaraqamia.app.contracts.generated.NewsSourcesResponse
import com.royaraqamia.app.contracts.generated.NewsSourcesResponseSourcesItem
import java.net.URLEncoder
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

/** One catalogue source, as the checklist draws it. */
data class NewsSource(
    val id: String,
    val name: String,
    val category: String,
    val region: String,
)

/** The catalogue and the ids this account kept, read together. */
data class NewsSelection(
    val sources: List<NewsSource>,
    val selected: Set<String>,
    val personalEnabled: Boolean,
)

/** What the selection write answered once the server had kept it. */
data class NewsSelectionWrite(
    val selected: Set<String>,
    val personalEnabled: Boolean,
)

/** One feed this account added, and the health the digest fetch reported. */
data class NewsPrivateSource(
    val id: String,
    val name: String,
    val url: String,
    val status: String,
    val lastError: String?,
)

/** The private list with the plan's ceiling and the digest switch. */
data class NewsPrivateSources(
    val sources: List<NewsPrivateSource>,
    val limited: Boolean,
    val cap: Int,
    val used: Int,
    val personalEnabled: Boolean,
)

/** One proposal's audit row. */
data class NewsRequest(
    val id: String,
    val name: String,
    val url: String,
    val status: String,
    val failure: String?,
    val resolvedUrl: String?,
    val note: String?,
)

/**
 * The account news page's reads and writes (#950): the same four routes the
 * site's three islands call, with the same bodies.
 *
 * `/api/me/news-sources` is the checklist, `/api/me/news-private-sources` its
 * private list and digest switch, and `/api/me/news-source-requests` the
 * proposal form and audit list. A write made in the app is therefore visible to
 * the page after the next read, because there is one server record rather than
 * a per-client copy (ADR-0098).
 */
class NewsRepository(private val client: ApiClient) {
    suspend fun selection(): ApiResult<NewsSelection> =
        when (val result = client.get<NewsSourcesResponse>(SOURCES_PATH)) {
            is ApiResult.Success -> {
                val body = result.value
                if (!body.success) {
                    refused(body.error)
                } else {
                    ApiResult.Success(
                        NewsSelection(
                            sources = body.sources.map { it.toDomain() },
                            // The page stores "everything" as an empty list so a
                            // source approved next week is included by default;
                            // the picker shows that as every row ticked.
                            selected =
                                if (body.selected.isEmpty()) {
                                    body.sources.map { it.id }.toSet()
                                } else {
                                    body.selected.toSet()
                                },
                            personalEnabled = body.personalEnabled,
                        )
                    )
                }
            }
            is ApiResult.Failure -> result
        }

    suspend fun saveSelection(
        sourceIds: List<String>,
        personalEnabled: Boolean,
    ): ApiResult<NewsSelectionWrite> =
        when (
            val result =
                client.put<NewsSourceSelectionResponse>(
                    SOURCES_PATH,
                    buildJsonObject {
                            put(
                                "sourceIds",
                                buildJsonArray { sourceIds.forEach { add(JsonPrimitive(it)) } },
                            )
                            put("personalEnabled", personalEnabled)
                        }
                        .toString(),
                )
        ) {
            is ApiResult.Success -> {
                val body = result.value
                if (!body.success) {
                    refused(body.error)
                } else {
                    ApiResult.Success(
                        NewsSelectionWrite(
                            selected = body.selected.toSet(),
                            personalEnabled = body.personalEnabled,
                        )
                    )
                }
            }
            is ApiResult.Failure -> result
        }

    suspend fun privateSources(): ApiResult<NewsPrivateSources> =
        when (val result = client.get<NewsPrivateSourcesResponse>(PRIVATE_SOURCES_PATH)) {
            is ApiResult.Success -> summaryOf(result.value)
            is ApiResult.Failure -> result
        }

    suspend fun enablePersonalDigest(): ApiResult<NewsPrivateSources> =
        when (
            val result =
                client.patch<NewsPrivateSourcesResponse>(
                    PRIVATE_SOURCES_PATH,
                    buildJsonObject { put("personalEnabled", true) }.toString(),
                )
        ) {
            is ApiResult.Success -> summaryOf(result.value)
            is ApiResult.Failure -> result
        }

    suspend fun deletePrivateSource(id: String): ApiResult<Unit> =
        when (val result = client.delete<NewsOkResponse>(privateSourcePath(id))) {
            is ApiResult.Success ->
                if (result.value.success) {
                    ApiResult.Success(Unit)
                } else {
                    refused(result.value.error)
                }
            is ApiResult.Failure -> result
        }

    suspend fun requests(): ApiResult<List<NewsRequest>> =
        when (val result = client.get<NewsSourceRequestsResponse>(REQUESTS_PATH)) {
            is ApiResult.Success -> {
                val body = result.value
                if (!body.success) {
                    refused(body.error)
                } else {
                    ApiResult.Success(body.requests.map { it.toDomain() })
                }
            }
            is ApiResult.Failure -> result
        }

    suspend fun submitRequest(url: String): ApiResult<NewsRequest> =
        when (
            val result =
                client.post<NewsSourceRequestResponse>(
                    REQUESTS_PATH,
                    buildJsonObject {
                            put("url", url)
                        }
                        .toString(),
                )
        ) {
            is ApiResult.Success -> {
                val body = result.value
                val request = body.request
                if (!body.success || request == null) {
                    refused(body.error)
                } else {
                    ApiResult.Success(request.toDomain())
                }
            }
            is ApiResult.Failure -> result
        }

    private fun summaryOf(body: NewsPrivateSourcesResponse): ApiResult<NewsPrivateSources> =
        if (!body.success) {
            refused(body.error)
        } else {
            ApiResult.Success(
                NewsPrivateSources(
                    sources = body.sources.map { it.toDomain() },
                    limited = body.limited,
                    cap = body.cap.toInt(),
                    used = body.used.toInt(),
                    personalEnabled = body.personalEnabled,
                )
            )
        }

    private fun NewsSourcesResponseSourcesItem.toDomain(): NewsSource =
        NewsSource(
            id = id,
            name = name,
            category = category.name.lowercase(),
            region = region.name.lowercase(),
        )

    private fun NewsPrivateSourcesResponseSourcesItem.toDomain(): NewsPrivateSource =
        NewsPrivateSource(
            id = id,
            name = name,
            url = url,
            status = status.name.lowercase(),
            lastError = lastError,
        )

    private fun NewsSourceRequestsResponseRequestsItem.toDomain(): NewsRequest =
        NewsRequest(
            id = id,
            name = name,
            url = url,
            status = status.name.lowercase(),
            failure = failure?.name?.lowercase(),
            resolvedUrl = resolvedUrl,
            note = note,
        )

    private fun NewsSourceRequestResponseRequest.toDomain(): NewsRequest =
        NewsRequest(
            id = id,
            name = name,
            url = url,
            status = status.name.lowercase(),
            failure = failure?.name?.lowercase(),
            resolvedUrl = resolvedUrl,
            note = note,
        )

    /** A body the server refused, with its own sentence when it carried one. */
    private fun <T> refused(sentence: String?): ApiResult<T> =
        ApiResult.Failure(ApiError.Server(200, sentence.orEmpty()))

    companion object {
        const val SOURCES_PATH = "/api/me/news-sources"
        const val PRIVATE_SOURCES_PATH = "/api/me/news-private-sources"
        const val REQUESTS_PATH = "/api/me/news-source-requests"

        fun privateSourcePath(id: String): String =
            "$PRIVATE_SOURCES_PATH/${URLEncoder.encode(id, Charsets.UTF_8.name())}"
    }
}

/**
 * The sentence a failed write should draw (#950).
 *
 * A refused write reaches `ApiClient` as `Server` with the response body as its
 * detail, and that body is the same `{ success, error }` envelope the successful
 * calls decode. Reading the sentence out of it keeps the server's reason
 * ("هذا المصدر موجود في قائمتك") instead of replacing it with a generic line.
 */
object NewsFailure {
    fun message(error: ApiError, fallback: String): String =
        when (error) {
            is ApiError.Server -> sentenceOf(error.detail) ?: fallback
            else -> fallback
        }

    private fun sentenceOf(body: String): String? =
        when (val decoded = ContractCodec.decode<NewsOkResponse>(body)) {
            is ApiResult.Success -> decoded.value.error
            is ApiResult.Failure -> null
        }
}
