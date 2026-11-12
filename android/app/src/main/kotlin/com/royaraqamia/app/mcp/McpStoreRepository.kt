package com.royaraqamia.app.mcp

import com.royaraqamia.app.api.ApiClient
import com.royaraqamia.app.contracts.ApiError
import com.royaraqamia.app.contracts.ApiResult
import com.royaraqamia.app.contracts.ContractCodec
import com.royaraqamia.app.contracts.generated.McpCatalogPageResult
import com.royaraqamia.app.contracts.generated.McpConnectionListResult
import com.royaraqamia.app.contracts.generated.McpStartRequest
import com.royaraqamia.app.contracts.generated.McpStartResultEnvelope
import com.royaraqamia.app.contracts.generated.McpStartResultEnvelopeDataKind
import java.net.URLEncoder

/**
 * The store tab's reads and its one write (#1256, ADR-0159).
 *
 * The paths are the page's own (`frontend/api/mcp-catalog.ts`,
 * `frontend/api/mcp-connections.ts`): one route per surface (ADR-0098), so the
 * app cannot list a row the page would refuse to show. Three rules come from the
 * page's store tab and are the reason this class holds state at all:
 *
 * - **No request on open.** The sheet opens on the picker; the store is read the
 *   first time its tab is chosen, and never before.
 * - **The session's cache, not the sheet's.** Closing the sheet unmounts the
 *   panel, so a reopen would draw a skeleton for a list the member saw a minute
 *   ago. The cache lives here, keyed by the member's identity, and a sign-out (or
 *   a second sign-in in the same process) drops it rather than showing the first
 *   member's apps to the second.
 * - **One bounded query.** `nextCursor` is always `null` (ADR-0162): the store is
 *   the curated list, not the whole mirror, so there is no pager to draw and no
 *   `cursor` to send.
 */
class McpStoreRepository(
    private val client: ApiClient,
    private val siteUrl: String,
    /** The member the cached rows belong to; a different key is a different member. */
    private val identityKey: () -> String,
) {
    private var owner: String? = null
    private var connections: List<MarketplaceConnection>? = null
    private var catalogue: List<MarketplaceServer>? = null

    /** The connections the last read answered, or `null` when nothing was read yet. */
    fun cachedConnections(): List<MarketplaceConnection>? {
        syncOwner()
        return connections
    }

    /** The catalogue as the last blank search left it, or `null`. */
    fun cachedCatalogue(): List<MarketplaceServer>? {
        syncOwner()
        return catalogue
    }

    /** The member's outbound apps: the store's first section. */
    suspend fun loadConnections(): ApiResult<List<MarketplaceConnection>> {
        syncOwner()
        return when (val result = client.get<McpConnectionListResult>(CONNECTIONS_PATH)) {
            is ApiResult.Success -> {
                val body = result.value
                if (!body.success) {
                    ApiResult.Failure(ApiError.Server(200, body.error ?: "the list was refused"))
                } else {
                    val rows = body.data.orEmpty().map { it.toConnection() }
                    connections = rows
                    ApiResult.Success(rows)
                }
            }
            is ApiResult.Failure -> result
        }
    }

    /**
     * One search over the curated store.
     *
     * Only the blank term is cached, the way the page caches only its default
     * page: a term is the member's own and would grow the cache with every word
     * they typed.
     */
    suspend fun search(term: String): ApiResult<List<MarketplaceServer>> {
        syncOwner()
        val path =
            if (term.isBlank()) {
                SERVERS_PATH
            } else {
                "$SERVERS_PATH?q=${URLEncoder.encode(term, Charsets.UTF_8.name())}"
            }
        return when (val result = client.get<McpCatalogPageResult>(path)) {
            is ApiResult.Success -> {
                val body = result.value
                if (!body.success) {
                    ApiResult.Failure(ApiError.Server(200, body.error ?: "the store was refused"))
                } else {
                    val rows = body.data.servers.map { it.toServer() }
                    if (term.isBlank()) catalogue = rows
                    ApiResult.Success(rows)
                }
            }
            is ApiResult.Failure -> result
        }
    }

    /**
     * Starts a connection: the provider's consent page, or a connection the
     * server already made for a row that needs no consent (or a key the member
     * pasted, #1269). The server's own sentence becomes the refusal's detail.
     */
    suspend fun start(registryName: String, apiKey: String? = null): ApiResult<MarketplaceStart> {
        // The body is the generated request, encoded with the same codec the
        // answers are read with: `explicitNulls = false` is what keeps a key the
        // caller did not type out of the body instead of sending `"apiKey":null`.
        val body =
            ContractCodec.encode(
                McpStartRequest(
                    registryName = registryName,
                    apiKey = apiKey?.takeIf { it.isNotEmpty() },
                )
            )
        return when (val result = client.post<McpStartResultEnvelope>(START_PATH, body)) {
            is ApiResult.Success -> {
                val answer = result.value
                val data = answer.data
                if (!answer.success || data == null) {
                    ApiResult.Failure(ApiError.Server(200, answer.error ?: "the connection was refused"))
                } else {
                    when (data.kind) {
                        McpStartResultEnvelopeDataKind.AUTHORIZE ->
                            data.authorizeUrl?.let { ApiResult.Success(MarketplaceStart.Authorize(it)) }
                                ?: ApiResult.Failure(ApiError.InvalidContract("authorizeUrl", "missing"))
                        McpStartResultEnvelopeDataKind.CONNECTED ->
                            data.connectionId?.let { ApiResult.Success(MarketplaceStart.Connected(it)) }
                                ?: ApiResult.Failure(ApiError.InvalidContract("connectionId", "missing"))
                    }
                }
            }
            is ApiResult.Failure -> result
        }
    }

    /**
     * A row's brand mark, through our own proxy (`/mcp/icon?name=`).
     *
     * The address is the account's, never the publisher's: the route resolves
     * the row's stored URL behind the egress policy, which is what keeps a
     * hotlinked logo out of the member's browser and this from being a general
     * proxy. A row that ships a path we serve (`/brand/mcp/...`) is read from
     * the same origin, as the page does.
     */
    fun brandMarkUrl(server: MarketplaceServer): String {
        val iconUrl = server.iconUrl
        if (iconUrl != null && iconUrl.startsWith("/")) {
            return "${siteUrl.trimEnd('/')}$iconUrl"
        }
        val name = URLEncoder.encode(server.registryName, Charsets.UTF_8.name())
        return "${siteUrl.trimEnd('/')}$ICON_PATH?name=$name"
    }

    private fun syncOwner() {
        val key = identityKey()
        if (key != owner) {
            owner = key
            connections = null
            catalogue = null
        }
    }

    companion object {
        const val CONNECTIONS_PATH = "/api/me/mcp/connections"
        const val SERVERS_PATH = "/api/mcp/marketplace/servers"
        const val START_PATH = "/api/mcp/marketplace/connections/start"

        /** The site's same-origin proxy for a catalogue row's mark. */
        const val ICON_PATH = "/mcp/icon"
    }
}
