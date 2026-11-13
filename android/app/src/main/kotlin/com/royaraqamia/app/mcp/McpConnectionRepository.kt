package com.royaraqamia.app.mcp

import com.royaraqamia.app.api.ApiClient
import com.royaraqamia.app.contracts.ApiError
import com.royaraqamia.app.contracts.ApiResult
import com.royaraqamia.app.contracts.ContractCodec
import com.royaraqamia.app.contracts.generated.McpConnectionActionResult
import com.royaraqamia.app.contracts.generated.McpConnectionDetailResult
import com.royaraqamia.app.contracts.generated.McpConnectionToolUpdate
import com.royaraqamia.app.contracts.generated.McpConnectionUpdate
import com.royaraqamia.app.contracts.generated.McpConnectionUpdatePermissionLevel
import java.net.URLEncoder

/**
 * The connection screen's reads and writes (#1224, #1256).
 *
 * The paths and the bodies are the page's own (`frontend/api/mcp-connections.ts`):
 * one route per surface (ADR-0098), so the app cannot edit something the page
 * would refuse. The writes answer `{ success, error }` and a refusal's sentence
 * crosses unchanged — the screen draws the server's words, not a guess at them.
 *
 * `PATCH /api/me/mcp/connections/<id>` carries one of three edits — the enabled
 * switch, the permission level, or a replacement key (#1269) — and each is its
 * own call here, because each is its own control on the screen.
 */
class McpConnectionRepository(private val client: ApiClient) {
    /** The connection and everything it advertised. A 404 is its own answer. */
    suspend fun detail(connectionId: String): ApiResult<ConnectionDetail> =
        when (val result = client.get<McpConnectionDetailResult>(path(connectionId))) {
            is ApiResult.Success -> {
                val body = result.value
                if (!body.success || body.data == null) {
                    ApiResult.Failure(ApiError.Server(200, body.error ?: "the connection was refused"))
                } else {
                    ApiResult.Success(body.data.toDetail())
                }
            }
            is ApiResult.Failure -> result
        }

    /** Turns the connection off without revoking it. */
    suspend fun setEnabled(connectionId: String, enabled: Boolean): ApiResult<Unit> =
        write(
            connectionId,
            ContractCodec.encode(McpConnectionUpdate(enabled = enabled)),
        )

    /** The member's own widening (ADR-0155, decision 6). */
    suspend fun setPermission(
        connectionId: String,
        permission: MarketplacePermission,
    ): ApiResult<Unit> =
        write(
            connectionId,
            ContractCodec.encode(
                McpConnectionUpdate(permissionLevel = permission.toWire())
            ),
        )

    /** Replaces the key a live `api_key` connection holds (#1269). */
    suspend fun replaceKey(connectionId: String, apiKey: String): ApiResult<Unit> =
        write(connectionId, ContractCodec.encode(McpConnectionUpdate(apiKey = apiKey)))

    /** One tool's switch, addressed by the name the server gave it. */
    suspend fun setTool(
        connectionId: String,
        toolName: String,
        enabled: Boolean,
    ): ApiResult<Unit> =
        when (
            val result =
                client.patch<McpConnectionActionResult>(
                    "${path(connectionId)}/tools",
                    ContractCodec.encode(McpConnectionToolUpdate(toolName = toolName, enabled = enabled)),
                )
        ) {
            is ApiResult.Success ->
                if (result.value.success) {
                    ApiResult.Success(Unit)
                } else {
                    ApiResult.Failure(ApiError.Server(200, result.value.error ?: "the switch was refused"))
                }
            is ApiResult.Failure -> result
        }

    /** Cuts the grant loose; the server refuses the provider's next call. */
    suspend fun disconnect(connectionId: String): ApiResult<Unit> =
        when (val result = client.delete<McpConnectionActionResult>(path(connectionId))) {
            is ApiResult.Success ->
                if (result.value.success) {
                    ApiResult.Success(Unit)
                } else {
                    ApiResult.Failure(ApiError.Server(200, result.value.error ?: "the disconnect was refused"))
                }
            is ApiResult.Failure -> result
        }

    private suspend fun write(connectionId: String, body: String): ApiResult<Unit> =
        when (val result = client.patch<McpConnectionActionResult>(path(connectionId), body)) {
            is ApiResult.Success ->
                if (result.value.success) {
                    ApiResult.Success(Unit)
                } else {
                    ApiResult.Failure(ApiError.Server(200, result.value.error ?: "the change was refused"))
                }
            is ApiResult.Failure -> result
        }

    companion object {
        fun path(connectionId: String): String =
            "$BASE/${URLEncoder.encode(connectionId, Charsets.UTF_8.name())}"

        private const val BASE = "/api/me/mcp/connections"
    }
}

/** The screen's vocabulary, as the route spells it. */
internal fun MarketplacePermission.toWire(): McpConnectionUpdatePermissionLevel =
    when (this) {
        MarketplacePermission.ASK -> McpConnectionUpdatePermissionLevel.ASK
        MarketplacePermission.READS -> McpConnectionUpdatePermissionLevel.READS
        MarketplacePermission.ALL -> McpConnectionUpdatePermissionLevel.ALL
    }
