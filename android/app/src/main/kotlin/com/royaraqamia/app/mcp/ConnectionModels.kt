package com.royaraqamia.app.mcp

import com.royaraqamia.app.contracts.generated.McpConnectionDetailResultData
import com.royaraqamia.app.contracts.generated.McpConnectionDetailResultDataAuthMode
import com.royaraqamia.app.contracts.generated.McpConnectionDetailResultDataPermissionLevel
import com.royaraqamia.app.contracts.generated.McpConnectionDetailResultDataStatus

/**
 * One tool the connection advertises, with its switch (#1224).
 *
 * `stale` means the server stopped advertising it since the last `tools/list`:
 * the row stays — the member's switch must survive a server's bad day — and the
 * screen says the list changed since connect.
 */
data class ConnectionTool(
    val name: String,
    val description: String?,
    val readOnly: Boolean,
    val enabled: Boolean,
    val stale: Boolean,
)

/**
 * The post-connect screen's record: the connection, the grant the provider named,
 * and every tool it advertised.
 *
 * `scopes` is the grant as the provider named it, which is the one fact that says
 * what the connection may actually do. It is empty for a row whose tokens
 * predate the record, and the screen says that rather than drawing nothing.
 */
data class ConnectionDetail(
    val id: String,
    val registryName: String,
    val displayName: String?,
    val enabled: Boolean,
    val permission: MarketplacePermission,
    val status: MarketplaceStatus,
    val authMode: MarketplaceAuthMode,
    val lastError: String?,
    val scopes: List<String>,
    val tools: List<ConnectionTool>,
) {
    val name: String get() = displayName ?: registryName

    /** A tool the server stopped advertising: one sentence covers the list. */
    val hasStaleTools: Boolean get() = tools.any { it.stale }
}

internal fun McpConnectionDetailResultData.toDetail(): ConnectionDetail =
    ConnectionDetail(
        id = id,
        registryName = registryName,
        displayName = displayName,
        enabled = enabled,
        permission =
            when (permissionLevel) {
                McpConnectionDetailResultDataPermissionLevel.ASK -> MarketplacePermission.ASK
                McpConnectionDetailResultDataPermissionLevel.READS -> MarketplacePermission.READS
                McpConnectionDetailResultDataPermissionLevel.ALL -> MarketplacePermission.ALL
            },
        status =
            when (status) {
                McpConnectionDetailResultDataStatus.ACTIVE -> MarketplaceStatus.ACTIVE
                McpConnectionDetailResultDataStatus.NEEDS_REAUTH -> MarketplaceStatus.NEEDS_REAUTH
                McpConnectionDetailResultDataStatus.ERROR -> MarketplaceStatus.ERROR
                McpConnectionDetailResultDataStatus.REVOKED -> MarketplaceStatus.ERROR
            },
        authMode =
            when (authMode) {
                McpConnectionDetailResultDataAuthMode.OAUTH -> MarketplaceAuthMode.OAUTH
                McpConnectionDetailResultDataAuthMode.NONE -> MarketplaceAuthMode.NONE
                McpConnectionDetailResultDataAuthMode.API_KEY -> MarketplaceAuthMode.API_KEY
            },
        lastError = lastError,
        scopes = scopes,
        tools =
            tools.map { tool ->
                ConnectionTool(
                    name = tool.name,
                    description = tool.description,
                    readOnly = tool.readOnly,
                    enabled = tool.enabled,
                    stale = tool.stale,
                )
            },
    )
