package com.royaraqamia.app.mcp

import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Icon
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.royaraqamia.app.account.AvatarLoader
import com.royaraqamia.app.contracts.ApiError
import com.royaraqamia.app.contracts.ApiResult
import com.royaraqamia.app.plans.PlanDates
import com.royaraqamia.app.shared.NeedsConnection
import com.royaraqamia.app.shared.NeedsConnectionState
import com.royaraqamia.app.theme.LocalRoySpacing
import com.royaraqamia.app.theme.LocalRoyTypeScale
import com.royaraqamia.app.theme.Recipes
import com.royaraqamia.app.theme.RoyColors
import com.royaraqamia.app.ui.vectors.LucideVectors
import android.graphics.BitmapFactory
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/**
 * The store tab of the apps sheet (#1256, ADR-0159, ADR-0162).
 *
 * The site's half is `frontend/ui/apps/store-tab.tsx`, and this is the same
 * panel: the member's connections first, then the curated store the surface's
 * search field filters. The sheet owns the field, so this receives the term and
 * owns what belongs to the answer — the debounce, the race guard, and the rows.
 *
 * The data policy is the page's (`apps-cache.ts`):
 *
 * - nothing is requested on open; the first composition is the tab's first
 *   activation, because [com.royaraqamia.app.shell.ServicesSheet] draws this
 *   only while the store tab is chosen;
 * - the session cache answers a later visit immediately, and the read still
 *   runs in the background so a stale row never stands as the answer;
 * - a typed term is debounced 300ms; only the blank page is cached.
 *
 * A connection is a two-ended act: a row that consents answers the provider's own
 * origin, which leaves through the system browser (`onOpenExternal`), and a row
 * that needs no consent (or a key, #1269) is connected by the server and opens
 * its screen. The app never intercepts a token: the callback lands on the site.
 */
@Composable
fun MarketplaceTab(
    repository: McpStoreRepository,
    query: String,
    signedIn: Boolean,
    onSignIn: () -> Unit,
    /** The post-connect screen (`/mcp/apps/<id>`), still the document in this slice. */
    onOpenConnection: (String) -> Unit,
    /** The provider's consent page, a third-party origin the browser visits. */
    onOpenExternal: (String) -> Unit,
    modifier: Modifier = Modifier,
    /** Reads a row's brand mark; null draws the monogram alone. */
    brandMark: AvatarLoader? = null,
) {
    val spacing = LocalRoySpacing.current
    val type = LocalRoyTypeScale.current
    val scope = rememberCoroutineScope()

    var state by remember {
        mutableStateOf<MarketplaceUiState>(
            repository.cachedCatalogue()?.let { MarketplaceUiState.Ready(it) }
                ?: MarketplaceUiState.Loading
        )
    }
    var connections by remember { mutableStateOf(repository.cachedConnections()) }
    var connectionsFailed by remember { mutableStateOf(false) }
    var connectionsOffline by remember { mutableStateOf(false) }
    var actionError by remember { mutableStateOf<String?>(null) }
    var consentFor by remember { mutableStateOf<MarketplaceServer?>(null) }
    var apiKey by remember { mutableStateOf("") }
    var keyError by remember { mutableStateOf<String?>(null) }
    var connectingTo by remember { mutableStateOf<String?>(null) }

    // The last answer the field's term owns, so a slower earlier answer cannot
    // land under a newer word. `remember` in the panel is enough: a closed sheet
    // has nothing in flight worth honouring.
    var answeredTerm by remember { mutableStateOf("") }
    var firstSearch by remember { mutableStateOf(true) }
    var searching by remember { mutableStateOf(false) }

    suspend fun readConnections() {
        connectionsFailed = false
        connectionsOffline = false
        when (val result = repository.loadConnections()) {
            is ApiResult.Success -> connections = result.value
            is ApiResult.Failure -> {
                connections = null
                connectionsOffline = result.error is ApiError.Network
                connectionsFailed = true
            }
        }
    }

    fun connect(server: MarketplaceServer, key: String?) {
        connectingTo = server.registryName
        actionError = null
        scope.launch {
            when (val result = repository.start(server.registryName, key)) {
                is ApiResult.Success -> {
                    consentFor = null
                    apiKey = ""
                    keyError = null
                    when (val started = result.value) {
                        is MarketplaceStart.Authorize -> onOpenExternal(started.url)
                        is MarketplaceStart.Connected -> {
                            // The slot is live; the list a later visit draws must
                            // say so rather than offering the row again.
                            readConnections()
                            onOpenConnection(started.connectionId)
                        }
                    }
                    connectingTo = null
                }
                is ApiResult.Failure -> {
                    val sentence =
                        (result.error as? ApiError.Server)?.detail
                            ?: McpStoreCopy.CONNECT_FAILED
                    if (key != null) keyError = sentence else actionError = sentence
                    connectingTo = null
                }
            }
        }
    }

    LaunchedEffect(repository, signedIn) {
        if (!signedIn) return@LaunchedEffect
        readConnections()
    }

    LaunchedEffect(repository, signedIn, query) {
        if (!signedIn) return@LaunchedEffect
        val term = query.trim()
        // The first search on an empty box is not a keystroke, so it does not wait
        // for one: the tab draws its answer immediately and later terms debounce.
        val wait = if (firstSearch) 0L else MarketplaceMetrics.searchDebounceMs
        firstSearch = false
        if (wait > 0) delay(wait)
        searching = true
        val result = repository.search(term)
        state = MarketplaceUiState.from(result, term)
        answeredTerm = term
        searching = false
    }

    if (!signedIn) {
        SignedOut(modifier, onSignIn)
        return
    }

    // A search over a list already drawn is a refresh, so the rows are dimmed
    // while it runs: the reader sees the old answer and the sentence agree.
    val dimmed = searching && answeredTerm != query.trim()

    Column(
        modifier =
            modifier
                .fillMaxWidth()
                .verticalScroll(rememberScrollState())
                .testTag(MarketplaceMetrics.PANEL)
                .padding(
                    start = MarketplaceMetrics.bodyPaddingHorizontal,
                    end = MarketplaceMetrics.bodyPaddingHorizontal,
                    top = MarketplaceMetrics.bodyPaddingTop,
                    bottom = MarketplaceMetrics.bodyPaddingBottom,
                ),
        verticalArrangement = Arrangement.spacedBy(MarketplaceMetrics.sectionGap),
    ) {
        if (actionError != null) {
            AutoError(actionError!!)
        }

        Column(verticalArrangement = Arrangement.spacedBy(MarketplaceMetrics.sectionTitleGap)) {
            Text(
                text = McpStoreCopy.CONNECTIONS_TITLE,
                modifier = Modifier.fillMaxWidth().testTag(MarketplaceMetrics.CONNECTIONS_TITLE),
                style = type.h3.copy(fontWeight = FontWeight.ExtraBold),
                color = RoyColors.foreground,
                maxLines = 1,
            )

            when {
                connectionsFailed && connectionsOffline ->
                    NeedsConnection(
                        message = McpStoreCopy.CONNECTIONS_OFFLINE,
                        state = NeedsConnectionState.Inline,
                        onRetry = { scope.launch { readConnections() } },
                    )
                connectionsFailed ->
                    FailureRow(
                        message = McpStoreCopy.CONNECTIONS_FAILED,
                        onRetry = { scope.launch { readConnections() } },
                    )
                connections == null -> Skeleton(rows = 1)
                connections!!.isEmpty() ->
                    EmptyCard(
                        title = McpStoreCopy.CONNECTIONS_EMPTY_TITLE,
                        body = McpStoreCopy.CONNECTIONS_EMPTY_BODY,
                    )
                else ->
                    Column(verticalArrangement = Arrangement.spacedBy(MarketplaceMetrics.rowGap)) {
                        connections!!.forEach { connection ->
                            ConnectionCard(
                                connection = connection,
                                onClick = { onOpenConnection(connection.id) },
                            )
                        }
                    }
            }
        }

        Column(
            modifier = Modifier.alpha(if (dimmed) 0.6f else 1f),
            verticalArrangement = Arrangement.spacedBy(MarketplaceMetrics.rowGap),
        ) {
            when (val current = state) {
                MarketplaceUiState.Loading -> Skeleton(rows = 2)
                MarketplaceUiState.Failed ->
                    FailureRow(
                        message = McpStoreCopy.SEARCH_FAILED,
                        onRetry = { scope.launch { resubmit(repository, query.trim()) { state = it } } },
                    )
                MarketplaceUiState.Offline ->
                    NeedsConnection(
                        message = McpStoreCopy.SEARCH_OFFLINE,
                        state = NeedsConnectionState.Inline,
                        onRetry = { scope.launch { resubmit(repository, query.trim()) { state = it } } },
                    )
                MarketplaceUiState.Empty ->
                    EmptyCard(
                        title = McpStoreCopy.STORE_EMPTY_TITLE,
                        body = McpStoreCopy.STORE_EMPTY_BODY,
                    )
                MarketplaceUiState.NoMatch ->
                    EmptyCard(
                        title = McpStoreCopy.SEARCH_EMPTY_TITLE,
                        body = McpStoreCopy.SEARCH_EMPTY_BODY,
                    )
                is MarketplaceUiState.Ready -> {
                    val linked = connections.orEmpty().associateBy { it.registryName }
                    current.servers.forEach { server ->
                        CatalogueRow(
                            server = server,
                            connection = linked[server.registryName],
                            connecting = connectingTo == server.registryName,
                            disabled = connectingTo != null,
                            brandMark = brandMark,
                            brandMarkUrl = { repository.brandMarkUrl(server) },
                            onConnect = {
                                apiKey = ""
                                keyError = null
                                consentFor = server
                            },
                            onOpenConnection = onOpenConnection,
                        )
                    }
                }
            }
        }

        if (searching) {
            Text(
                text =
                    if (query.trim().isEmpty()) McpStoreCopy.SEARCH_REFRESHING
                    else McpStoreCopy.SEARCH_LOADING,
                modifier = Modifier.fillMaxWidth().testTag(MarketplaceMetrics.STATUS),
                style = type.xs,
                color = RoyColors.mutedForeground,
                textAlign = TextAlign.Center,
            )
        }
    }

    ConsentDialog(
        server = consentFor,
        apiKey = apiKey,
        keyError = keyError,
        connecting = connectingTo != null,
        onApiKeyChange = {
            apiKey = it
            keyError = null
        },
        onConfirm = {
            val target = consentFor
            if (target != null) {
                if (target.authMode == MarketplaceAuthMode.API_KEY) {
                    val key = apiKey.trim()
                    if (key.isEmpty()) {
                        keyError = McpStoreCopy.KEY_REQUIRED
                    } else {
                        connect(target, key)
                    }
                } else {
                    connect(target, null)
                }
            }
        },
        onCancel = {
            if (connectingTo == null) {
                consentFor = null
                apiKey = ""
                keyError = null
            }
        },
    )
}

/** One retry from a failed section: the same read, its own state written back. */
private suspend fun resubmit(
    repository: McpStoreRepository,
    term: String,
    write: (MarketplaceUiState) -> Unit,
) {
    write(MarketplaceUiState.from(repository.search(term), term))
}

/** The signed-out answer: the page's one card and its way in. */
@Composable
private fun SignedOut(modifier: Modifier, onSignIn: () -> Unit) {
    val type = LocalRoyTypeScale.current
    val spacing = LocalRoySpacing.current

    Column(
        modifier =
            modifier
                .fillMaxWidth()
                .testTag(MarketplaceMetrics.SIGNED_OUT)
                .padding(horizontal = spacing.elementGap, vertical = spacing.elementGapSm),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(spacing.elementGapSm),
    ) {
        Text(
            text = McpStoreCopy.SIGN_IN_BODY,
            style = type.small,
            color = RoyColors.mutedForeground,
            textAlign = TextAlign.Center,
        )
        Row(
            modifier =
                Modifier.clip(Recipes.Cta.radius)
                    .background(RoyColors.primary)
                    .clickable(onClick = onSignIn)
                    .semantics { role = Role.Button }
                    .testTag(MarketplaceMetrics.SIGN_IN_ACTION)
                    .padding(horizontal = 24.dp, vertical = 10.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                text = McpStoreCopy.SIGN_IN,
                style = type.small.copy(fontWeight = FontWeight.Bold),
                color = RoyColors.primaryForeground,
                maxLines = 1,
            )
        }
    }
}

/** One connection: its state, what it costs, and the way to manage it. */
@Composable
private fun ConnectionCard(connection: MarketplaceConnection, onClick: () -> Unit) {
    val type = LocalRoyTypeScale.current
    val spacing = LocalRoySpacing.current

    Surface(
        modifier = Modifier.fillMaxWidth().testTag(MarketplaceMetrics.CONNECTION).clickable(onClick = onClick),
        shape = Recipes.Card.radius,
        color = Recipes.Card.container,
        border = Recipes.Card.border,
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 16.dp, vertical = 14.dp),
            horizontalArrangement = Arrangement.spacedBy(12.dp),
            verticalAlignment = Alignment.Top,
        ) {
            Icon(
                imageVector = LucideVectors.Plug,
                contentDescription = null,
                tint = RoyColors.primary,
                modifier = Modifier.size(Recipes.Glyph.sm),
            )
            Column(
                modifier = Modifier.weight(1f),
                verticalArrangement = Arrangement.spacedBy(spacing.elementGapSm / 2),
            ) {
                Text(
                    text = connection.name,
                    style = type.small.copy(fontWeight = FontWeight.Bold),
                    color = RoyColors.foreground,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                Text(
                    text =
                        "${McpStoreCopy.TOOL_COUNT.replace("{count}", connection.toolCount.toString())}" +
                            " · " +
                            McpStoreCopy.LAST_USED +
                            " " +
                            (connection.lastUsedAt?.let { PlanDates.label(it) } ?: McpStoreCopy.NEVER_USED),
                    style = type.xs,
                    color = RoyColors.mutedForeground,
                    maxLines = 2,
                )
                ConnectionBadges(connection)
            }
            Text(
                text = McpStoreCopy.MANAGE,
                style = type.xs.copy(fontWeight = FontWeight.Bold),
                color = RoyColors.foreground,
                maxLines = 1,
                modifier =
                    Modifier.clip(RoundedCornerShape(12.dp))
                        .border(1.dp, RoyColors.border.copy(alpha = 0.6f), RoundedCornerShape(12.dp))
                        .padding(horizontal = 12.dp, vertical = 8.dp),
            )
        }
    }
}

/** The state of a connection, in one line: the list and the catalogue row draw it alike. */
@Composable
private fun ConnectionBadges(connection: MarketplaceConnection) {
    Row(
        horizontalArrangement = Arrangement.spacedBy(6.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        val (tone, label) =
            when (connection.status) {
                MarketplaceStatus.NEEDS_REAUTH -> RoyColors.warning to McpStoreCopy.STATUS_NEEDS_REAUTH
                MarketplaceStatus.ERROR -> RoyColors.destructive to McpStoreCopy.STATUS_ERROR
                MarketplaceStatus.ACTIVE -> RoyColors.primary to McpStoreCopy.STATUS_ACTIVE
            }
        Badge(label, tone)
        Badge(permissionLabel(connection.permission), RoyColors.mutedForeground)
        if (!connection.enabled) Badge(McpStoreCopy.CONNECTION_DISABLED, RoyColors.warning)
    }
}

/** One catalogue row: the server's mark, its own name, and the way in. */
@Composable
private fun CatalogueRow(
    server: MarketplaceServer,
    connection: MarketplaceConnection?,
    connecting: Boolean,
    disabled: Boolean,
    brandMark: AvatarLoader?,
    brandMarkUrl: () -> String,
    onConnect: () -> Unit,
    onOpenConnection: (String) -> Unit,
) {
    val type = LocalRoyTypeScale.current

    Surface(
        modifier = Modifier.fillMaxWidth().testTag(MarketplaceMetrics.SERVER),
        shape = Recipes.Card.radius,
        color = Recipes.Card.container,
        border = Recipes.Card.border,
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 16.dp, vertical = 14.dp),
            horizontalArrangement = Arrangement.spacedBy(12.dp),
            verticalAlignment = Alignment.Top,
        ) {
            BrandMark(server = server, loader = brandMark, url = brandMarkUrl)
            Column(
                modifier = Modifier.weight(1f),
                verticalArrangement = Arrangement.spacedBy(4.dp),
            ) {
                Row(
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(
                        text = server.name,
                        style = type.small.copy(fontWeight = FontWeight.Bold),
                        color = RoyColors.foreground,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                    if (server.verified) {
                        Row(
                            horizontalArrangement = Arrangement.spacedBy(4.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            modifier =
                                Modifier.semantics {
                                    contentDescription = McpStoreCopy.VERIFIED_BADGE
                                },
                        ) {
                            Icon(
                                imageVector = LucideVectors.BadgeCheck,
                                contentDescription = null,
                                tint = RoyColors.primary,
                                modifier = Modifier.size(Recipes.Glyph.sm),
                            )
                            Text(
                                text = McpStoreCopy.VERIFIED_BADGE,
                                style = type.xs.copy(fontWeight = FontWeight.Bold),
                                color = RoyColors.primary,
                                maxLines = 1,
                            )
                        }
                    }
                    server.nameAr?.let { arabic ->
                        Text(
                            text = arabic,
                            style = type.xs,
                            color = RoyColors.mutedForeground,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                    }
                }
                server.description?.let { description ->
                    Text(
                        text = description,
                        style = type.xs,
                        color = RoyColors.mutedForeground,
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
                connection?.let { ConnectionBadges(it) }
            }

            if (connection != null) {
                ManagePill(onClick = { onOpenConnection(connection.id) })
            } else {
                ConnectPill(connecting = connecting, enabled = !disabled, onClick = onConnect)
            }
        }
    }
}

/** The row's brand mark, or the first letter of its name when there is none. */
@Composable
private fun BrandMark(server: MarketplaceServer, loader: AvatarLoader?, url: () -> String) {
    var image by remember(server.registryName) { mutableStateOf<ImageBitmap?>(null) }

    LaunchedEffect(server.registryName, loader) {
        if (loader == null) return@LaunchedEffect
        val bytes = loader.load(url()) ?: return@LaunchedEffect
        image = BitmapFactory.decodeByteArray(bytes, 0, bytes.size)?.asImageBitmap()
    }

    val shape = RoundedCornerShape(MarketplaceMetrics.markRadius)
    val drawn = image
    if (drawn != null) {
        Image(
            bitmap = drawn,
            contentDescription = null,
            contentScale = ContentScale.Fit,
            modifier =
                Modifier.size(MarketplaceMetrics.markSize)
                    .clip(shape)
                    .border(1.dp, RoyColors.border.copy(alpha = 0.5f), shape)
                    .background(RoyColors.background)
                    .testTag(MarketplaceMetrics.MARK),
        )
    } else {
        Box(
            modifier =
                Modifier.size(MarketplaceMetrics.markSize)
                    .clip(shape)
                    .background(RoyColors.muted.copy(alpha = 0.5f))
                    .border(1.dp, RoyColors.border.copy(alpha = 0.5f), shape)
                    .testTag(MarketplaceMetrics.MARK),
            contentAlignment = Alignment.Center,
        ) {
            Text(
                text = server.name.take(1).uppercase(),
                style = LocalRoyTypeScale.current.small.copy(fontWeight = FontWeight.ExtraBold),
                color = RoyColors.mutedForeground,
            )
        }
    }
}

/** The site's violet "ربط" pill, inert while a write is in flight. */
@Composable
private fun ConnectPill(connecting: Boolean, enabled: Boolean, onClick: () -> Unit) {
    val type = LocalRoyTypeScale.current
    Row(
        modifier =
            Modifier.clip(RoundedCornerShape(12.dp))
                .background(RoyColors.primary.copy(alpha = if (enabled) 0.1f else 0.05f))
                .border(1.dp, RoyColors.primary.copy(alpha = 0.3f), RoundedCornerShape(12.dp))
                .clickable(enabled = enabled, onClick = onClick)
                .semantics { role = Role.Button }
                .testTag(MarketplaceMetrics.CONNECT)
                .padding(horizontal = 12.dp, vertical = 8.dp),
        horizontalArrangement = Arrangement.spacedBy(6.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (connecting) {
            Icon(
                imageVector = LucideVectors.Loader2,
                contentDescription = null,
                tint = RoyColors.primary,
                modifier = Modifier.size(Recipes.Glyph.sm),
            )
        } else {
            Icon(
                imageVector = LucideVectors.Plus,
                contentDescription = null,
                tint = RoyColors.primary,
                modifier = Modifier.size(Recipes.Glyph.sm),
            )
        }
        Text(
            text = if (connecting) McpStoreCopy.CONNECTING else McpStoreCopy.CONNECT,
            style = type.xs.copy(fontWeight = FontWeight.Bold),
            color = RoyColors.primary,
            maxLines = 1,
        )
    }
}

/** "إدارة", the way to a connection that is already linked. */
@Composable
private fun ManagePill(onClick: () -> Unit) {
    Text(
        text = McpStoreCopy.MANAGE,
        style = LocalRoyTypeScale.current.xs.copy(fontWeight = FontWeight.Bold),
        color = RoyColors.foreground,
        maxLines = 1,
        modifier =
            Modifier.clip(RoundedCornerShape(12.dp))
                .background(Recipes.Card.container)
                .border(1.dp, RoyColors.border.copy(alpha = 0.6f), RoundedCornerShape(12.dp))
                .clickable(onClick = onClick)
                .semantics { role = Role.Button }
                .testTag(MarketplaceMetrics.MANAGE)
                .padding(horizontal = 12.dp, vertical = 8.dp),
    )
}

/** A pill badge, the site's `rounded-full border px-2 py-0.5 text-xs font-bold`. */
@Composable
private fun Badge(label: String, tone: androidx.compose.ui.graphics.Color) {
    Text(
        text = label,
        style = LocalRoyTypeScale.current.xs.copy(fontWeight = FontWeight.Bold),
        color = tone,
        maxLines = 1,
        modifier =
            Modifier.clip(RoundedCornerShape(percent = 50))
                .background(tone.copy(alpha = 0.1f))
                .border(1.dp, tone.copy(alpha = 0.3f), RoundedCornerShape(percent = 50))
                .padding(horizontal = 8.dp, vertical = 2.dp),
    )
}

/** The consent ask, before the document leaves for the provider's own screen. */
@Composable
private fun ConsentDialog(
    server: MarketplaceServer?,
    apiKey: String,
    keyError: String?,
    connecting: Boolean,
    onApiKeyChange: (String) -> Unit,
    onConfirm: () -> Unit,
    onCancel: () -> Unit,
) {
    if (server == null) return
    val type = LocalRoyTypeScale.current

    AlertDialog(
        modifier = Modifier.testTag(MarketplaceMetrics.CONSENT),
        onDismissRequest = onCancel,
        title = {
            Text(
                text =
                    when (server.authMode) {
                        MarketplaceAuthMode.API_KEY ->
                            McpStoreCopy.KEY_TITLE.replace("{name}", server.name)
                        MarketplaceAuthMode.NONE ->
                            McpStoreCopy.NO_AUTH_TITLE.replace("{name}", server.name)
                        MarketplaceAuthMode.OAUTH ->
                            McpStoreCopy.CONSENT_TITLE.replace("{name}", server.name)
                    },
                style = type.h3.copy(fontWeight = FontWeight.Bold),
                color = RoyColors.foreground,
            )
        },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                when (server.authMode) {
                    MarketplaceAuthMode.API_KEY -> {
                        Text(text = McpStoreCopy.KEY_BODY, style = type.xs, color = RoyColors.foreground)
                        OutlinedTextField(
                            value = apiKey,
                            onValueChange = onApiKeyChange,
                            label = { Text(McpStoreCopy.KEY_LABEL) },
                            placeholder = { Text(McpStoreCopy.KEY_PLACEHOLDER) },
                            singleLine = true,
                            visualTransformation = PasswordVisualTransformation(),
                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
                            modifier = Modifier.fillMaxWidth().testTag(MarketplaceMetrics.KEY_FIELD),
                        )
                        keyError?.let {
                            Text(
                                text = it,
                                style = type.xs.copy(fontWeight = FontWeight.Bold),
                                color = RoyColors.destructive,
                            )
                        }
                    }
                    MarketplaceAuthMode.NONE ->
                        Text(text = McpStoreCopy.NO_AUTH_BODY, style = type.xs, color = RoyColors.foreground)
                    MarketplaceAuthMode.OAUTH ->
                        if (server.requestedScopes.isEmpty()) {
                            Text(
                                text = McpStoreCopy.CONSENT_DEFAULT,
                                style = type.xs,
                                color = RoyColors.foreground,
                            )
                        } else {
                            Text(
                                text = McpStoreCopy.CONSENT_ASK,
                                style = type.xs,
                                color = RoyColors.foreground,
                            )
                            Text(
                                text = server.requestedScopes.joinToString(" · "),
                                style = type.xs,
                                color = RoyColors.mutedForeground,
                            )
                            Text(
                                text = McpStoreCopy.CONSENT_NOTE,
                                style = type.xs,
                                color = RoyColors.foreground,
                            )
                        }
                }
            }
        },
        confirmButton = {
            TextButton(
                onClick = onConfirm,
                enabled = !connecting,
                modifier = Modifier.testTag(MarketplaceMetrics.CONSENT_CONFIRM),
            ) {
                Text(
                    text =
                        if (server.authMode == MarketplaceAuthMode.OAUTH) {
                            McpStoreCopy.CONSENT_CONTINUE
                        } else {
                            McpStoreCopy.CONNECT
                        },
                    style = type.small.copy(fontWeight = FontWeight.Bold),
                )
            }
        },
        dismissButton = {
            TextButton(
                onClick = onCancel,
                enabled = !connecting,
                modifier = Modifier.testTag(MarketplaceMetrics.CONSENT_CANCEL),
            ) {
                Text(text = McpStoreCopy.CANCEL, style = type.small)
            }
        },
    )
}

/** The store's refusal line: the sentence and one retry. */
@Composable
private fun FailureRow(message: String, onRetry: () -> Unit) {
    val type = LocalRoyTypeScale.current
    val spacing = LocalRoySpacing.current

    Surface(
        modifier = Modifier.fillMaxWidth().testTag(MarketplaceMetrics.FAILURE),
        shape = Recipes.Card.radius,
        color = RoyColors.destructive.copy(alpha = 0.05f),
        border = BorderStroke(1.dp, RoyColors.destructive.copy(alpha = 0.3f)),
    ) {
        Column(
            modifier = Modifier.padding(Recipes.Card.padding(spacing)),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(spacing.elementGapSm),
        ) {
            Row(
                horizontalArrangement = Arrangement.spacedBy(spacing.elementGapSm),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Icon(
                    imageVector = LucideVectors.ShieldAlert,
                    contentDescription = null,
                    tint = RoyColors.destructive,
                    modifier = Modifier.size(Recipes.Glyph.sm),
                )
                Text(
                    text = message,
                    style = type.small.copy(fontWeight = FontWeight.Bold),
                    color = RoyColors.destructive,
                    textAlign = TextAlign.Center,
                )
            }
            Row(
                modifier =
                    Modifier.clip(RoundedCornerShape(12.dp))
                        .border(1.dp, RoyColors.border.copy(alpha = 0.6f), RoundedCornerShape(12.dp))
                        .clickable(onClick = onRetry)
                        .semantics { role = Role.Button }
                        .testTag(MarketplaceMetrics.RETRY)
                        .padding(horizontal = 16.dp, vertical = 8.dp),
                horizontalArrangement = Arrangement.spacedBy(6.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Icon(
                    imageVector = LucideVectors.RefreshCw,
                    contentDescription = null,
                    tint = RoyColors.foreground,
                    modifier = Modifier.size(Recipes.Glyph.sm),
                )
                Text(
                    text = McpStoreCopy.RETRY,
                    style = type.xs.copy(fontWeight = FontWeight.Bold),
                    color = RoyColors.foreground,
                )
            }
        }
    }
}

/** The connect refusal, in the page's red banner. */
@Composable
private fun AutoError(message: String) {
    Row(
        modifier =
            Modifier.fillMaxWidth()
                .background(RoyColors.destructive.copy(alpha = 0.05f), Recipes.Card.radius)
                .border(1.dp, RoyColors.destructive.copy(alpha = 0.3f), Recipes.Card.radius)
                .testTag(MarketplaceMetrics.ACTION_ERROR)
                .padding(horizontal = 16.dp, vertical = 12.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalAlignment = Alignment.Top,
    ) {
        Icon(
            imageVector = LucideVectors.AlertTriangle,
            contentDescription = null,
            tint = RoyColors.destructive,
            modifier = Modifier.size(Recipes.Glyph.sm),
        )
        Text(
            text = message,
            style = LocalRoyTypeScale.current.small.copy(fontWeight = FontWeight.Bold),
            color = RoyColors.destructive,
        )
    }
}

/** The page's empty card: a muted mark, a title and its sentence. */
@Composable
private fun EmptyCard(title: String, body: String) {
    val type = LocalRoyTypeScale.current
    val spacing = LocalRoySpacing.current

    Column(
        modifier =
            Modifier.fillMaxWidth()
                .background(Recipes.Card.container, Recipes.Card.radius)
                .border(1.dp, RoyColors.border.copy(alpha = 0.5f), Recipes.Card.radius)
                .testTag(MarketplaceMetrics.EMPTY)
                .padding(Recipes.Card.padding(spacing)),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(spacing.elementGapSm / 2),
    ) {
        Box(
            modifier =
                Modifier.size(Recipes.GuestMark.size)
                    .clip(Recipes.GuestMark.radius)
                    .background(Recipes.GuestMark.surface)
                    .border(1.dp, RoyColors.border.copy(alpha = 0.4f), Recipes.GuestMark.radius),
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                imageVector = LucideVectors.Unplug,
                contentDescription = null,
                tint = Recipes.GuestMark.content,
                modifier = Modifier.size(22.dp),
            )
        }
        Text(
            text = title,
            style = type.small.copy(fontWeight = FontWeight.Bold),
            color = RoyColors.foreground,
            textAlign = TextAlign.Center,
            modifier = Modifier.testTag(MarketplaceMetrics.EMPTY_TITLE),
        )
        Text(
            text = body,
            style = type.xs,
            color = RoyColors.mutedForeground,
            textAlign = TextAlign.Center,
        )
    }
}

/** Loading blocks that pulse while a read is out, as the page's skeleton does. */
@Composable
private fun Skeleton(rows: Int) {
    val transition = rememberInfiniteTransition(label = "marketplace-skeleton")
    val alpha by
        transition.animateFloat(
            initialValue = Recipes.Skeleton.pulseFrom,
            targetValue = Recipes.Skeleton.pulseTo,
            animationSpec =
                infiniteRepeatable(
                    animation = tween(Recipes.Skeleton.pulseMs),
                    repeatMode = RepeatMode.Reverse,
                ),
            label = "marketplace-skeleton-alpha",
        )

    Column(
        modifier =
            Modifier.fillMaxWidth()
                .alpha(alpha)
                .testTag(MarketplaceMetrics.SKELETON)
                // The page's blocks carry the same label: a spinner with no name
                // is a screen a screen reader cannot describe (#1256).
                .semantics { contentDescription = McpStoreCopy.LOADING_LABEL },
        verticalArrangement = Arrangement.spacedBy(Recipes.Skeleton.gap),
    ) {
        repeat(rows) {
            Box(
                Modifier.fillMaxWidth().height(80.dp).clip(Recipes.Skeleton.radius).background(
                    Recipes.Skeleton.fill
                )
            )
        }
    }
}

/** The permission level in the page's own words. */
private fun permissionLabel(permission: MarketplacePermission): String =
    when (permission) {
        MarketplacePermission.ASK -> McpStoreCopy.PERMISSION_ASK
        MarketplacePermission.READS -> McpStoreCopy.PERMISSION_READS
        MarketplacePermission.ALL -> McpStoreCopy.PERMISSION_ALL
    }

/**
 * The store panel's geometry, read from the page's classes (ADR-0118).
 *
 * The surface's own band (tabs, field) belongs to the sheet; these are the body's
 * numbers: `space-y-8` between sections, `space-y-3` under a title, `space-y-2.5`
 * between cards, `rounded-2xl` cards with `px-4 py-3.5`, and the `h-10 w-10`
 * brand tile.
 */
internal object MarketplaceMetrics {
    const val PANEL = "marketplace-panel"
    const val CONNECTIONS_TITLE = "marketplace-connections-title"
    const val CONNECTION = "marketplace-connection"
    const val SERVER = "marketplace-server"
    const val MARK = "marketplace-mark"
    const val CONNECT = "marketplace-connect"
    const val MANAGE = "marketplace-manage"
    const val CONSENT = "marketplace-consent"
    const val KEY_FIELD = "marketplace-key"
    const val CONSENT_CONFIRM = "marketplace-consent-confirm"
    const val CONSENT_CANCEL = "marketplace-consent-cancel"
    const val EMPTY = "marketplace-empty"
    const val EMPTY_TITLE = "marketplace-empty-title"
    const val FAILURE = "marketplace-failure"
    const val RETRY = "marketplace-retry"
    const val SKELETON = "marketplace-skeleton"
    const val STATUS = "marketplace-status"
    const val ACTION_ERROR = "marketplace-action-error"
    const val SIGNED_OUT = "marketplace-signed-out"
    const val SIGN_IN_ACTION = "marketplace-sign-in"

    val sectionGap = 32.dp
    val sectionTitleGap = 12.dp
    val rowGap = 10.dp
    val bodyPaddingHorizontal = 12.dp
    val bodyPaddingTop = 12.dp
    val bodyPaddingBottom = 12.dp
    val markSize = 40.dp
    val markRadius = 12.dp

    /** The page's search is debounced 300ms; the first answer does not wait. */
    const val searchDebounceMs = 300L
}
