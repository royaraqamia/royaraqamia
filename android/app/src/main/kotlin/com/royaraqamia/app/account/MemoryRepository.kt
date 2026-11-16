package com.royaraqamia.app.account

import com.royaraqamia.app.api.ApiClient
import com.royaraqamia.app.contracts.ApiError
import com.royaraqamia.app.contracts.ApiResult
import com.royaraqamia.app.contracts.ContractCodec
import com.royaraqamia.app.contracts.generated.AgentMemoryActionResult
import com.royaraqamia.app.contracts.generated.AgentMemoryListResult
import com.royaraqamia.app.contracts.generated.AgentMemoryListResultFactsItemKind
import com.royaraqamia.app.contracts.generated.AgentMemoryListResultFactsItemScope
import kotlinx.serialization.Serializable

/**
 * The memory page's four routes (#1428): the read, one fact's edit and delete,
 * and the switches — the same routes `frontend/api/account-memory.ts` calls, so
 * the two clients cannot read different memory (ADR-0098).
 *
 * The list is read from the server rather than assembled locally, because the
 * server is the record: an edit or a forget that half-succeeded must not look
 * complete because the client removed the row optimistically. The page filters
 * its row on a successful answer, and so does this repository.
 *
 * The export is not a route this class reads: it is a file, and the screen hands
 * the member to it in the browser (the response is an attachment).
 */
class MemoryRepository(private val client: ApiClient) {
    suspend fun read(): ApiResult<AgentMemory> =
        when (val result = client.get<AgentMemoryListResult>(PATH)) {
            is ApiResult.Success -> {
                val body = result.value
                if (!body.success) {
                    ApiResult.Failure(ApiError.Server(200, body.error.orEmpty()))
                } else {
                    ApiResult.Success(
                        AgentMemory(
                            facts = body.facts.orEmpty().map { fact ->
                                MemoryFact(
                                    id = fact.id,
                                    scope = scopeOf(fact.scope),
                                    kind = kindOf(fact.kind),
                                    text = fact.text,
                                    product = fact.product,
                                    threadId = fact.threadId,
                                    updatedAt = fact.updatedAt,
                                )
                            },
                            settings =
                                body.settings?.let { settings ->
                                    MemorySettings(
                                        account = settings.account,
                                        product = settings.product,
                                        thread = settings.thread,
                                    )
                                } ?: MemorySettings.Default,
                        )
                    )
                }
            }
            is ApiResult.Failure -> result
        }

    /** Writes one fact's text; the page does the same on the same route. */
    suspend fun edit(id: String, text: String): ApiResult<Unit> =
        answer(
            client.patch<AgentMemoryActionResult>(
                factPath(id),
                ContractCodec.encode(MemoryEditBody(text = text)),
            )
        )

    /** Forgets one fact — the row and its embedding, in one transaction server-side. */
    suspend fun forget(id: String): ApiResult<Unit> =
        answer(client.delete<AgentMemoryActionResult>(factPath(id)))

    /** Flips one scope, and answers every switch as the server now holds them. */
    suspend fun setScope(scope: MemoryScope, enabled: Boolean): ApiResult<MemorySettings> =
        when (
            val result =
                client.patch<AgentMemoryListResult>(
                    SETTINGS_PATH,
                    ContractCodec.encode(settingsBody(scope, enabled)),
                )
        ) {
            is ApiResult.Success -> {
                val body = result.value
                val settings = body.settings
                if (!body.success || settings == null) {
                    ApiResult.Failure(ApiError.Server(200, body.error.orEmpty()))
                } else {
                    ApiResult.Success(
                        MemorySettings(
                            account = settings.account,
                            product = settings.product,
                            thread = settings.thread,
                        )
                    )
                }
            }
            is ApiResult.Failure -> result
        }

    private fun answer(result: ApiResult<AgentMemoryActionResult>): ApiResult<Unit> =
        when (result) {
            is ApiResult.Success ->
                if (result.value.success) {
                    ApiResult.Success(Unit)
                } else {
                    ApiResult.Failure(ApiError.Server(200, result.value.error.orEmpty()))
                }
            is ApiResult.Failure -> result
        }

    /** One switch, as the route reads it: the scope's own key and nothing else. */
    private fun settingsBody(scope: MemoryScope, enabled: Boolean): MemoryScopeBody =
        when (scope) {
            MemoryScope.ACCOUNT -> MemoryScopeBody(account = enabled)
            MemoryScope.PRODUCT -> MemoryScopeBody(product = enabled)
            MemoryScope.THREAD -> MemoryScopeBody(thread = enabled)
        }

    private fun scopeOf(scope: AgentMemoryListResultFactsItemScope): MemoryScope =
        when (scope) {
            AgentMemoryListResultFactsItemScope.ACCOUNT -> MemoryScope.ACCOUNT
            AgentMemoryListResultFactsItemScope.PRODUCT -> MemoryScope.PRODUCT
            AgentMemoryListResultFactsItemScope.THREAD -> MemoryScope.THREAD
        }

    private fun kindOf(kind: AgentMemoryListResultFactsItemKind): MemoryKind =
        when (kind) {
            AgentMemoryListResultFactsItemKind.FACT -> MemoryKind.FACT
            AgentMemoryListResultFactsItemKind.PREFERENCE -> MemoryKind.PREFERENCE
            AgentMemoryListResultFactsItemKind.HEALTH -> MemoryKind.HEALTH
            AgentMemoryListResultFactsItemKind.LEGAL -> MemoryKind.LEGAL
            AgentMemoryListResultFactsItemKind.FINANCIAL -> MemoryKind.FINANCIAL
        }

    companion object {
        const val PATH = "/api/account/memory"
        const val SETTINGS_PATH = "$PATH/settings"
        const val EXPORT_PATH = "$PATH/export"

        fun factPath(id: String): String = "$PATH/$id"
    }
}

/**
 * One fact's edit, in the body the route parses.
 *
 * `explicitNulls = false` in [ContractCodec] is what makes the switches a patch
 * rather than a replacement: the scopes a caller does not name are absent from
 * the body, and the route leaves them alone.
 */
@Serializable
data class MemoryEditBody(val text: String)

/** One scope's switch; the other two are absent, not null. */
@Serializable
data class MemoryScopeBody(
    val account: Boolean? = null,
    val product: Boolean? = null,
    val thread: Boolean? = null,
)
