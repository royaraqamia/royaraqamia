package com.royaraqamia.app.mcp

import com.royaraqamia.app.contracts.generated.McpCatalogPageResultDataServersItem
import com.royaraqamia.app.contracts.generated.McpCatalogPageResultDataServersItemAuthMode
import com.royaraqamia.app.contracts.generated.McpConnectionListResultDataItem
import com.royaraqamia.app.contracts.generated.McpConnectionListResultDataItemAuthMode
import com.royaraqamia.app.contracts.generated.McpConnectionListResultDataItemPermissionLevel
import com.royaraqamia.app.contracts.generated.McpConnectionListResultDataItemStatus

/**
 * The store tab's two records, named the way the site names them (#1256).
 *
 * The wire types are generated (`McpMarketplaceContracts.kt`,
 * `McpCatalogContracts.kt`); these are the shapes the panel draws, so the screen
 * reads `permission` and `status` in the contract's own vocabulary instead of a
 * five-word generated type. The mapping is total and lives here, which is what
 * keeps a field the schema adds from being silently dropped by the screen.
 */
enum class MarketplacePermission {
    ASK,
    READS,
    ALL,
}

/** `revoked` never reaches a list: a revoked row is deleted server-side. */
enum class MarketplaceStatus {
    ACTIVE,
    NEEDS_REAUTH,
    ERROR,
}

enum class MarketplaceAuthMode {
    OAUTH,
    NONE,
    API_KEY,
}

/** One connection, as the store's first section lists it. */
data class MarketplaceConnection(
    val id: String,
    val registryName: String,
    val displayName: String?,
    val enabled: Boolean,
    val permission: MarketplacePermission,
    val status: MarketplaceStatus,
    val authMode: MarketplaceAuthMode,
    val toolCount: Long,
    val connectedAt: String,
    val lastUsedAt: String?,
) {
    /** The name the member reads: their own rename, or the server's. */
    val name: String get() = displayName ?: registryName
}

/** One row of the curated store (ADR-0162): verified, connectable, and marked. */
data class MarketplaceServer(
    val registryName: String,
    val title: String?,
    val description: String?,
    val nameAr: String?,
    val iconUrl: String?,
    val verified: Boolean,
    val authMode: MarketplaceAuthMode,
    val requestedScopes: List<String>,
) {
    val name: String get() = title ?: registryName
}

/** What the start route answered (#1269): a consent page to visit, or a connection. */
sealed interface MarketplaceStart {
    /** The provider's own origin: the member's browser leaves for it. */
    data class Authorize(val url: String) : MarketplaceStart

    /** The server made the connection without a consent screen. */
    data class Connected(val connectionId: String) : MarketplaceStart
}

internal fun McpConnectionListResultDataItem.toConnection(): MarketplaceConnection =
    MarketplaceConnection(
        id = id,
        registryName = registryName,
        displayName = displayName,
        enabled = enabled,
        permission =
            when (permissionLevel) {
                McpConnectionListResultDataItemPermissionLevel.ASK -> MarketplacePermission.ASK
                McpConnectionListResultDataItemPermissionLevel.READS -> MarketplacePermission.READS
                McpConnectionListResultDataItemPermissionLevel.ALL -> MarketplacePermission.ALL
            },
        status =
            when (status) {
                McpConnectionListResultDataItemStatus.ACTIVE -> MarketplaceStatus.ACTIVE
                McpConnectionListResultDataItemStatus.NEEDS_REAUTH -> MarketplaceStatus.NEEDS_REAUTH
                McpConnectionListResultDataItemStatus.ERROR -> MarketplaceStatus.ERROR
                // A revoked row is deleted; a stale body that still carries one
                // is drawn as the error it was, never as a live connection.
                McpConnectionListResultDataItemStatus.REVOKED -> MarketplaceStatus.ERROR
            },
        authMode =
            when (authMode) {
                McpConnectionListResultDataItemAuthMode.OAUTH -> MarketplaceAuthMode.OAUTH
                McpConnectionListResultDataItemAuthMode.NONE -> MarketplaceAuthMode.NONE
                McpConnectionListResultDataItemAuthMode.API_KEY -> MarketplaceAuthMode.API_KEY
            },
        toolCount = toolCount,
        connectedAt = connectedAt,
        lastUsedAt = lastUsedAt,
    )

internal fun McpCatalogPageResultDataServersItem.toServer(): MarketplaceServer =
    MarketplaceServer(
        registryName = registryName,
        title = title,
        description = description,
        nameAr = nameAr,
        iconUrl = iconUrl,
        verified = verified,
        authMode =
            when (authMode) {
                McpCatalogPageResultDataServersItemAuthMode.OAUTH -> MarketplaceAuthMode.OAUTH
                McpCatalogPageResultDataServersItemAuthMode.NONE -> MarketplaceAuthMode.NONE
                McpCatalogPageResultDataServersItemAuthMode.API_KEY -> MarketplaceAuthMode.API_KEY
            },
        requestedScopes = requestedScopes,
    )
