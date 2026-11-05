package com.royaraqamia.app.accountnews

import com.royaraqamia.app.api.ApiClient
import com.royaraqamia.app.contracts.ApiError
import com.royaraqamia.app.contracts.ApiResult
import com.royaraqamia.app.contracts.ContractCodec
import com.royaraqamia.app.contracts.generated.NewsOkResponse
import com.royaraqamia.app.contracts.generated.NewsPrivateSourcesResponse
import com.royaraqamia.app.contracts.generated.NewsPrivateSourcesResponseRowsItem
import com.royaraqamia.app.contracts.generated.NewsSourceRequestResponse
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
)

/** What the selection write answered once the server had kept it. */
data class NewsSelectionWrite(
    val selected: Set<String>,
)

/**
 * One row of the reader's one list (ADR-0130): a feed they hold, or a link on
 * its way to becoming one. `kind` decides what a delete acts on and `state` is
 * the one badge the row draws.
 */
data class NewsOwnedSource(
    val id: String,
    val kind: String,
    val name: String,
    val url: String,
    val resolvedUrl: String?,
    val state: String,
    val failure: String?,
    val note: String?,
    val lastError: String?,
)

/** The one list with the plan's ceiling. */
data class NewsOwnedSources(
    val rows: List<NewsOwnedSource>,
    val limited: Boolean,
    val cap: Int,
    val used: Int,
)

/**
 * The account news page's reads and writes (#950): the same routes the site's
 * two islands call, with the same bodies.
 *
 * `/api/me/news-sources` is the checklist, `/api/me/news-private-sources` the
 * one list of feeds and pending links, and `/api/me/news-source-requests` the
 * proposal and its cancellation. A write made in the app is therefore visible to
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
                        )
                    )
                }
            }
            is ApiResult.Failure -> result
        }

    suspend fun saveSelection(sourceIds: List<String>): ApiResult<NewsSelectionWrite> =
        when (
            val result =
                client.put<NewsSourceSelectionResponse>(
                    SOURCES_PATH,
                    buildJsonObject {
                            put(
                                "sourceIds",
                                buildJsonArray { sourceIds.forEach { add(JsonPrimitive(it)) } },
                            )
                        }
                        .toString(),
                )
        ) {
            is ApiResult.Success -> {
                val body = result.value
                if (!body.success) {
                    refused(body.error)
                } else {
                    ApiResult.Success(NewsSelectionWrite(selected = body.selected.toSet()))
                }
            }
            is ApiResult.Failure -> result
        }

    suspend fun ownedSources(): ApiResult<NewsOwnedSources> =
        when (val result = client.get<NewsPrivateSourcesResponse>(OWNED_SOURCES_PATH)) {
            is ApiResult.Success -> summaryOf(result.value)
            is ApiResult.Failure -> result
        }

    suspend fun deletePrivateSource(id: String): ApiResult<Unit> =
        delete("$OWNED_SOURCES_PATH/${URLEncoder.encode(id, Charsets.UTF_8.name())}")

    suspend fun deleteRequest(id: String): ApiResult<Unit> =
        delete("$REQUESTS_PATH/${URLEncoder.encode(id, Charsets.UTF_8.name())}")

    suspend fun submitRequest(url: String): ApiResult<Unit> =
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
            // Only the refusal is drawn here: the list above is what shows the new
            // row once it is read again (ADR-0130).
            is ApiResult.Success ->
                if (result.value.success) ApiResult.Success(Unit) else refused(result.value.error)
            is ApiResult.Failure -> result
        }

    private suspend fun delete(path: String): ApiResult<Unit> =
        when (val result = client.delete<NewsOkResponse>(path)) {
            is ApiResult.Success ->
                if (result.value.success) {
                    ApiResult.Success(Unit)
                } else {
                    refused(result.value.error)
                }
            is ApiResult.Failure -> result
        }

    private fun summaryOf(body: NewsPrivateSourcesResponse): ApiResult<NewsOwnedSources> =
        if (!body.success) {
            refused(body.error)
        } else {
            ApiResult.Success(
                NewsOwnedSources(
                    rows = body.rows.map { it.toDomain() },
                    limited = body.limited,
                    cap = body.cap.toInt(),
                    used = body.used.toInt(),
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

    private fun NewsPrivateSourcesResponseRowsItem.toDomain(): NewsOwnedSource =
        NewsOwnedSource(
            id = id,
            kind = kind.name.lowercase(),
            name = name,
            url = url,
            resolvedUrl = resolvedUrl,
            state = state.name.lowercase(),
            failure = failure?.name?.lowercase()?.replace('_', '-'),
            note = note,
            lastError = lastError,
        )

    /** A body the server refused, with its own sentence when it carried one. */
    private fun <T> refused(sentence: String?): ApiResult<T> =
        ApiResult.Failure(ApiError.Server(200, sentence.orEmpty()))

    companion object {
        const val SOURCES_PATH = "/api/me/news-sources"
        const val OWNED_SOURCES_PATH = "/api/me/news-private-sources"
        const val REQUESTS_PATH = "/api/me/news-source-requests"
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
