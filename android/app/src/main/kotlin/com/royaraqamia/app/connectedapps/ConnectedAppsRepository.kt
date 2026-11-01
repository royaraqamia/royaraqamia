package com.royaraqamia.app.connectedapps

import com.royaraqamia.app.api.ApiClient
import com.royaraqamia.app.contracts.ApiError
import com.royaraqamia.app.contracts.ApiResult
import com.royaraqamia.app.contracts.generated.McpConnectedAppActionResult
import com.royaraqamia.app.contracts.generated.McpConnectedAppListResult

/** One connected MCP client, as the account page lists it. */
data class ConnectedApp(
    val clientId: String,
    val name: String?,
    val connectedAt: String,
    val lastUsedAt: String?,
)

/**
 * The account page's connected clients (#657): the same two routes the site calls,
 * `/api/me/mcp/connected-apps` and its `DELETE`.
 *
 * The list is read from the server rather than filtered locally, because the server
 * is the record of what is still live: a revocation that half-succeeded must not
 * look complete because the client removed the row optimistically.
 */
class ConnectedAppsRepository(private val client: ApiClient) {
    suspend fun list(): ApiResult<List<ConnectedApp>> =
        when (val result = client.get<McpConnectedAppListResult>(LIST_PATH)) {
            is ApiResult.Success -> {
                val body = result.value
                if (!body.success) {
                    ApiResult.Failure(ApiError.Server(200, body.error ?: "the list was refused"))
                } else {
                    ApiResult.Success(
                        body.data.orEmpty().map { app ->
                            ConnectedApp(
                                clientId = app.clientId,
                                name = app.clientName,
                                connectedAt = app.connectedAt,
                                lastUsedAt = app.lastUsedAt,
                            )
                        }
                    )
                }
            }
            is ApiResult.Failure -> result
        }

    /** Cuts one grant loose; the client is refused on its next request, server-side. */
    suspend fun disconnect(clientId: String): ApiResult<Unit> = revoke(clientPath(clientId))

    /**
     * Cuts every grant at once: the collection's own `DELETE`, which is what the
     * page's "disconnect all" calls. Not a loop of single revokes — the server's
     * answer is the one that says the account has none left.
     */
    suspend fun disconnectAll(): ApiResult<Unit> = revoke(LIST_PATH)

    private suspend fun revoke(path: String): ApiResult<Unit> =
        when (val result = client.delete<McpConnectedAppActionResult>(path)) {
            is ApiResult.Success ->
                if (result.value.success) {
                    ApiResult.Success(Unit)
                } else {
                    ApiResult.Failure(ApiError.Server(200, result.value.error ?: "the disconnect was refused"))
                }
            is ApiResult.Failure -> result
        }

    companion object {
        const val LIST_PATH = "/api/me/mcp/connected-apps"

        fun clientPath(clientId: String): String = "$LIST_PATH/$clientId"
    }
}
