package com.royaraqamia.app.mcp

import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.BorderStroke
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
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Icon
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
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
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import com.royaraqamia.app.contracts.ApiError
import com.royaraqamia.app.contracts.ApiResult
import com.royaraqamia.app.shared.NeedsConnection
import com.royaraqamia.app.shared.NeedsConnectionState
import com.royaraqamia.app.theme.LocalRoySpacing
import com.royaraqamia.app.theme.LocalRoyTypeScale
import com.royaraqamia.app.theme.Recipes
import com.royaraqamia.app.theme.RoyColors
import com.royaraqamia.app.ui.vectors.LucideVectors
import kotlinx.coroutines.launch

/**
 * The post-connect screen (#1224, #1256).
 *
 * The site's half is `frontend/ui/mcp/connection-view.tsx`, and this is the same
 * screen: what the connection reaches, its permission level, the grant the
 * provider named (or the key it holds, #1269), every tool it advertised with its
 * switch, and «افصل». A connection is usable the moment it is made — these are
 * limits, not a second confirmation.
 *
 * Three rules come straight from the view and are the reason this is not a card:
 *
 * - a tool the server stopped advertising is drawn as stale rather than dropped,
 *   so the member's switch survives a server's bad day;
 * - «أعد الربط» is the same consent flow, and it reuses the connection's slot, so
 *   a member at their cap is not asked to free one to repair an app they have;
 * - a disconnect that the server accepted leaves for the store; one it refused
 *   stays on screen with the server's own sentence.
 */
@Composable
fun ConnectionScreen(
    repository: McpConnectionRepository,
    /** The store's start route: a reconnect is the same consent flow (#1227). */
    store: McpStoreRepository,
    connectionId: String,
    signedIn: Boolean,
    /** Whether this visit is a return from the provider's consent page. */
    connected: Boolean,
    onSignIn: () -> Unit,
    onOpenExternal: (String) -> Unit,
    onDisconnected: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val spacing = LocalRoySpacing.current
    val scope = rememberCoroutineScope()

    var state by remember { mutableStateOf<ConnectionUiState?>(null) }
    var actionError by remember { mutableStateOf<String?>(null) }
    var busyTool by remember { mutableStateOf<String?>(null) }
    var savingPermission by remember { mutableStateOf(false) }
    var savingEnabled by remember { mutableStateOf(false) }
    var disconnecting by remember { mutableStateOf(false) }
    var reconnecting by remember { mutableStateOf(false) }
    var confirmOpen by remember { mutableStateOf(false) }
    var newKey by remember { mutableStateOf("") }
    var savingKey by remember { mutableStateOf(false) }
    var keyError by remember { mutableStateOf<String?>(null) }
    var keySaved by remember { mutableStateOf(false) }

    suspend fun load() {
        state = ConnectionUiState.from(repository.detail(connectionId))
    }

    fun attempt(block: suspend () -> ApiResult<Unit>, after: suspend () -> Unit = {}) {
        scope.launch {
            when (val result = block()) {
                is ApiResult.Success -> {
                    actionError = null
                    after()
                    load()
                }
                is ApiResult.Failure ->
                    actionError =
                        (result.error as? ApiError.Server)?.detail ?: McpConnectionCopy.SAVE_FAILED
            }
        }
    }

    LaunchedEffect(repository, connectionId, signedIn) {
        if (signedIn) load()
    }

    val current = state

    if (!signedIn) {
        SignedOut(modifier, onSignIn)
        return
    }

    if (current == null) {
        Skeleton(modifier)
        return
    }

    when (current) {
        ConnectionUiState.NotFound -> {
            Card(
                modifier = modifier.testTag(ConnectionMetrics.NOT_FOUND),
                tone = RoyColors.border,
            ) {
                Text(
                    text = McpConnectionCopy.DETAIL_NOT_FOUND,
                    style = LocalRoyTypeScale.current.small.copy(fontWeight = FontWeight.Bold),
                    color = RoyColors.foreground,
                    textAlign = TextAlign.Center,
                )
            }
            return
        }
        ConnectionUiState.Offline -> {
            NeedsConnection(
                message = McpConnectionCopy.DETAIL_OFFLINE,
                state = NeedsConnectionState.Block,
                onRetry = { scope.launch { load() } },
                modifier = modifier,
            )
            return
        }
        ConnectionUiState.Failed -> {
            Column(
                modifier = modifier.fillMaxWidth(),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                Text(
                    text = McpConnectionCopy.DETAIL_FAILED,
                    style = LocalRoyTypeScale.current.small.copy(fontWeight = FontWeight.Bold),
                    color = RoyColors.destructive,
                    textAlign = TextAlign.Center,
                )
                PillButton(
                    label = McpStoreCopy.RETRY,
                    icon = LucideVectors.RefreshCw,
                    onClick = { scope.launch { load() } },
                    testTag = ConnectionMetrics.RETRY,
                )
            }
            return
        }
        is ConnectionUiState.Ready -> Unit
    }

    val detail = (current as ConnectionUiState.Ready).detail
    val type = LocalRoyTypeScale.current

    Column(
        modifier =
            modifier
                .fillMaxWidth()
                // The store's panel and this screen share one scroll body: the
                // sheet's body is a column, and the detail fills it.
                .verticalScroll(rememberScrollState())
                .testTag(ConnectionMetrics.SCREEN)
                .padding(horizontal = spacing.elementGap, vertical = spacing.elementGapSm),
        verticalArrangement = Arrangement.spacedBy(ConnectionMetrics.sectionGap),
    ) {
        if (connected) Banner(McpConnectionCopy.CONNECTED_BANNER)

        Column(
            modifier = Modifier.fillMaxWidth(),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Text(
                text = detail.name,
                modifier = Modifier.testTag(ConnectionMetrics.TITLE),
                style = type.h2.copy(fontWeight = FontWeight.ExtraBold),
                color = RoyColors.primary,
                textAlign = TextAlign.Center,
                maxLines = 2,
            )
            Text(
                text = McpConnectionCopy.DETAIL_REACH,
                style = type.small,
                color = RoyColors.mutedForeground,
                textAlign = TextAlign.Center,
            )
        }

        if (detail.status == MarketplaceStatus.NEEDS_REAUTH) {
            Column(
                modifier =
                    Modifier.fillMaxWidth()
                        .background(RoyColors.warning.copy(alpha = 0.1f), Recipes.Card.radius)
                        .border(1.dp, RoyColors.warning.copy(alpha = 0.4f), Recipes.Card.radius)
                        .padding(horizontal = 16.dp, vertical = 12.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                Notice(
                    // The grant sentence names an OAuth repair; a key and a
                    // no-auth row carry the service's own sentence instead.
                    text =
                        if (detail.authMode == MarketplaceAuthMode.OAUTH) {
                            McpConnectionCopy.DETAIL_NEEDS_REAUTH
                        } else {
                            detail.lastError ?: McpConnectionCopy.DETAIL_NEEDS_REAUTH
                        },
                    tone = RoyColors.warning,
                )
                if (detail.authMode == MarketplaceAuthMode.OAUTH) {
                    PillButton(
                        label =
                            if (reconnecting) {
                                McpConnectionCopy.RECONNECTING
                            } else {
                                McpConnectionCopy.RECONNECT
                            },
                        icon = LucideVectors.RefreshCw,
                        busy = reconnecting,
                        onClick = {
                            reconnecting = true
                            actionError = null
                            scope.launch {
                                when (val result = store.start(detail.registryName)) {
                                    is ApiResult.Success ->
                                        when (val started = result.value) {
                                            is MarketplaceStart.Authorize ->
                                                onOpenExternal(started.url)
                                            // A row that moved to no-auth (or a key) has
                                            // no consent page to visit.
                                            is MarketplaceStart.Connected -> load()
                                        }
                                    is ApiResult.Failure ->
                                        actionError =
                                            (result.error as? ApiError.Server)?.detail
                                                ?: McpConnectionCopy.RECONNECT_FAILED
                                }
                                reconnecting = false
                            }
                        },
                        testTag = ConnectionMetrics.RECONNECT,
                    )
                }
            }
        }

        if (detail.status == MarketplaceStatus.ERROR) {
            Notice(
                text = detail.lastError ?: McpConnectionCopy.DETAIL_UNREACHABLE,
                tone = RoyColors.destructive,
            )
        }
        // A refusal the provider answered with a scope is not a dead grant: the
        // sentence names the permission, and widening below is the repair.
        if (detail.status == MarketplaceStatus.ACTIVE && detail.lastError != null) {
            Notice(text = detail.lastError, tone = RoyColors.warning)
        }
        if (detail.hasStaleTools) {
            Notice(text = McpConnectionCopy.DETAIL_STALE, tone = RoyColors.warning)
        }
        actionError?.let { Notice(text = it, tone = RoyColors.destructive) }

        // The permission section: the on/off switch, then the three levels.
        Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    text = McpConnectionCopy.DETAIL_PERMISSION_TITLE,
                    style = type.h3.copy(fontWeight = FontWeight.ExtraBold),
                    color = RoyColors.foreground,
                )
                TogglePill(
                    on = detail.enabled,
                    busy = savingEnabled,
                    onClick = {
                        savingEnabled = true
                        scope.launch {
                            attempt({ repository.setEnabled(detail.id, !detail.enabled) })
                            savingEnabled = false
                        }
                    },
                )
            }

            Row(
                modifier = Modifier.fillMaxWidth().testTag(ConnectionMetrics.LEVELS),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                MarketplacePermission.entries.forEach { level ->
                    LevelButton(
                        modifier = Modifier.weight(1f),
                        level = level,
                        active = detail.permission == level,
                        enabled = !savingPermission,
                        onClick = {
                            if (detail.permission == level) return@LevelButton
                            savingPermission = true
                            scope.launch {
                                attempt({ repository.setPermission(detail.id, level) })
                                savingPermission = false
                            }
                        },
                    )
                }
            }
        }

        if (detail.authMode == MarketplaceAuthMode.OAUTH) {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(
                        text = McpConnectionCopy.DETAIL_SCOPES_TITLE,
                        style = type.h3.copy(fontWeight = FontWeight.ExtraBold),
                        color = RoyColors.foreground,
                    )
                    // One repair, one control: a dead grant already has its button
                    // in the banner, and two for the same flow read as two actions.
                    if (detail.status != MarketplaceStatus.NEEDS_REAUTH) {
                        PillButton(
                            label = McpConnectionCopy.WIDEN,
                            icon = LucideVectors.RefreshCw,
                            busy = reconnecting,
                            onClick = {
                                reconnecting = true
                                actionError = null
                                scope.launch {
                                    when (val result = store.start(detail.registryName)) {
                                        is ApiResult.Success ->
                                            when (val started = result.value) {
                                                is MarketplaceStart.Authorize ->
                                                    onOpenExternal(started.url)
                                                is MarketplaceStart.Connected -> load()
                                            }
                                        is ApiResult.Failure ->
                                            actionError =
                                                (result.error as? ApiError.Server)?.detail
                                                    ?: McpConnectionCopy.RECONNECT_FAILED
                                    }
                                    reconnecting = false
                                }
                            },
                            testTag = ConnectionMetrics.WIDEN,
                        )
                    }
                }

                Text(
                    text = McpConnectionCopy.DETAIL_SCOPES_BODY,
                    style = type.xs,
                    color = RoyColors.mutedForeground,
                )

                if (detail.scopes.isEmpty()) {
                    Card(modifier = Modifier.fillMaxWidth(), tone = RoyColors.border) {
                        Text(
                            text = McpConnectionCopy.DETAIL_SCOPES_EMPTY,
                            style = type.xs,
                            color = RoyColors.mutedForeground,
                        )
                    }
                } else {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(6.dp),
                    ) {
                        detail.scopes.forEach { scopeName ->
                            Text(
                                text = scopeName,
                                style = type.xs,
                                color = RoyColors.mutedForeground,
                                maxLines = 1,
                                modifier =
                                    Modifier.clip(RoundedCornerShape(8.dp))
                                        .background(RoyColors.muted.copy(alpha = 0.4f))
                                        .padding(horizontal = 8.dp, vertical = 4.dp),
                            )
                        }
                    }
                }

                Text(
                    text = McpConnectionCopy.DETAIL_SCOPES_ASK,
                    style = type.xs,
                    color = RoyColors.mutedForeground,
                )
            }
        } else {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                // A key or a no-auth connection has no grant to read and no
                // consent to widen (#1269): it has a credential — or nothing —
                // and the one repair is a new key.
                Text(
                    text = McpConnectionCopy.DETAIL_AUTH_TITLE,
                    style = type.h3.copy(fontWeight = FontWeight.ExtraBold),
                    color = RoyColors.foreground,
                )
                Text(
                    text =
                        if (detail.authMode == MarketplaceAuthMode.API_KEY) {
                            McpConnectionCopy.DETAIL_AUTH_API_KEY
                        } else {
                            McpConnectionCopy.DETAIL_AUTH_NONE
                        },
                    style = type.xs,
                    color = RoyColors.mutedForeground,
                )

                if (detail.authMode == MarketplaceAuthMode.API_KEY) {
                    Column(
                        modifier =
                            Modifier.fillMaxWidth()
                                .background(Recipes.Card.container, Recipes.Card.radius)
                                .border(1.dp, RoyColors.border.copy(alpha = 0.5f), Recipes.Card.radius)
                                .padding(horizontal = 16.dp, vertical = 12.dp),
                        verticalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        Text(
                            text = McpConnectionCopy.DETAIL_KEY_BODY,
                            style = type.xs,
                            color = RoyColors.mutedForeground,
                        )
                        Text(
                            text = McpConnectionCopy.DETAIL_KEY_LABEL,
                            style = type.xs.copy(fontWeight = FontWeight.Bold),
                            color = RoyColors.foreground,
                        )
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            OutlinedTextField(
                                value = newKey,
                                onValueChange = {
                                    newKey = it
                                    keyError = null
                                    keySaved = false
                                },
                                placeholder = { Text(McpConnectionCopy.DETAIL_KEY_PLACEHOLDER) },
                                singleLine = true,
                                visualTransformation = PasswordVisualTransformation(),
                                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
                                modifier = Modifier.weight(1f).testTag(ConnectionMetrics.KEY_FIELD),
                            )
                            PillButton(
                                label = McpConnectionCopy.DETAIL_KEY_ACTION,
                                icon = LucideVectors.Check,
                                busy = savingKey,
                                enabled = newKey.trim().isNotEmpty(),
                                onClick = {
                                    val key = newKey.trim()
                                    if (key.isEmpty()) return@PillButton
                                    savingKey = true
                                    keyError = null
                                    keySaved = false
                                    scope.launch {
                                        when (val result = repository.replaceKey(detail.id, key)) {
                                            is ApiResult.Success -> {
                                                newKey = ""
                                                keySaved = true
                                                load()
                                            }
                                            is ApiResult.Failure ->
                                                keyError =
                                                    (result.error as? ApiError.Server)?.detail
                                                        ?: McpConnectionCopy.DETAIL_KEY_FAILED
                                        }
                                        savingKey = false
                                    }
                                },
                                testTag = ConnectionMetrics.KEY_ACTION,
                            )
                        }
                        keyError?.let {
                            Text(
                                text = it,
                                style = type.xs.copy(fontWeight = FontWeight.Bold),
                                color = RoyColors.destructive,
                            )
                        }
                        if (keySaved) {
                            Text(
                                text = McpConnectionCopy.DETAIL_KEY_DONE,
                                style = type.xs.copy(fontWeight = FontWeight.Bold),
                                color = RoyColors.primary,
                            )
                        }
                    }
                }
            }
        }

        Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Text(
                text = McpConnectionCopy.DETAIL_TOOLS_TITLE,
                style = type.h3.copy(fontWeight = FontWeight.ExtraBold),
                color = RoyColors.foreground,
            )

            if (detail.tools.isEmpty()) {
                Card(modifier = Modifier.fillMaxWidth(), tone = RoyColors.border) {
                    Text(
                        text = McpConnectionCopy.DETAIL_TOOLS_EMPTY,
                        style = type.small,
                        color = RoyColors.mutedForeground,
                        textAlign = TextAlign.Center,
                        modifier = Modifier.fillMaxWidth(),
                    )
                }
            } else {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    detail.tools.forEach { tool ->
                        ToolRow(
                            tool = tool,
                            busy = busyTool == tool.name,
                            enabled = busyTool == null,
                            onToggle = {
                                busyTool = tool.name
                                scope.launch {
                                    attempt({ repository.setTool(detail.id, tool.name, !tool.enabled) }) {
                                        busyTool = null
                                    }
                                    busyTool = null
                                }
                            },
                        )
                    }
                }
            }
        }

        Row(modifier = Modifier.fillMaxWidth()) {
            Row(
                modifier =
                    Modifier.fillMaxWidth()
                        .clip(Recipes.Card.radius)
                        .background(RoyColors.destructive.copy(alpha = 0.05f))
                        .border(1.dp, RoyColors.destructive.copy(alpha = 0.25f), Recipes.Card.radius)
                        .clickable { confirmOpen = true }
                        .semantics { role = Role.Button }
                        .testTag(ConnectionMetrics.DISCONNECT)
                        .padding(horizontal = 16.dp, vertical = 12.dp),
                horizontalArrangement = Arrangement.Center,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Icon(
                    imageVector = LucideVectors.Unplug,
                    contentDescription = null,
                    tint = RoyColors.destructive,
                    modifier = Modifier.size(Recipes.Glyph.sm),
                )
                Text(
                    text = McpConnectionCopy.DETAIL_DISCONNECT,
                    style = type.small.copy(fontWeight = FontWeight.Bold),
                    color = RoyColors.destructive,
                    modifier = Modifier.padding(start = 8.dp),
                )
            }
        }
    }

    if (confirmOpen) {
        DisconnectDialog(
            name = detail.name,
            busy = disconnecting,
            onConfirm = {
                disconnecting = true
                scope.launch {
                    when (val result = repository.disconnect(detail.id)) {
                        is ApiResult.Success -> {
                            confirmOpen = false
                            onDisconnected()
                        }
                        is ApiResult.Failure ->
                            actionError =
                                (result.error as? ApiError.Server)?.detail
                                    ?: McpConnectionCopy.SAVE_FAILED
                    }
                    disconnecting = false
                }
            },
            onCancel = { if (!disconnecting) confirmOpen = false },
        )
    }
}

/** The disconnect ask: destructive, and in the same breath as the row it is about. */
@Composable
private fun DisconnectDialog(name: String, busy: Boolean, onConfirm: () -> Unit, onCancel: () -> Unit) {
    val type = LocalRoyTypeScale.current

    androidx.compose.material3.AlertDialog(
        modifier = Modifier.testTag(ConnectionMetrics.CONFIRM),
        onDismissRequest = onCancel,
        title = {
            Text(
                text = McpConnectionCopy.DETAIL_DISCONNECT_TITLE,
                style = type.h3.copy(fontWeight = FontWeight.Bold),
                color = RoyColors.foreground,
            )
        },
        text = {
            Text(
                text = McpConnectionCopy.DETAIL_DISCONNECT_MESSAGE.replace("{name}", name),
                style = type.small,
                color = RoyColors.foreground,
            )
        },
        confirmButton = {
            androidx.compose.material3.TextButton(
                onClick = onConfirm,
                enabled = !busy,
                modifier = Modifier.testTag(ConnectionMetrics.CONFIRM_ACTION),
            ) {
                Text(
                    text = McpConnectionCopy.CONFIRM_DISCONNECT,
                    style = type.small.copy(fontWeight = FontWeight.Bold),
                    color = RoyColors.destructive,
                )
            }
        },
        dismissButton = {
            androidx.compose.material3.TextButton(
                onClick = onCancel,
                enabled = !busy,
                modifier = Modifier.testTag(ConnectionMetrics.CONFIRM_CANCEL),
            ) {
                Text(text = McpStoreCopy.CANCEL, style = type.small)
            }
        },
    )
}

/** One tool: its name, what it may do, and its switch. */
@Composable
private fun ToolRow(tool: ConnectionTool, busy: Boolean, enabled: Boolean, onToggle: () -> Unit) {
    val type = LocalRoyTypeScale.current
    val spacing = LocalRoySpacing.current

    Surface(
        modifier = Modifier.fillMaxWidth().testTag(ConnectionMetrics.TOOL),
        shape = Recipes.Card.radius,
        color = Recipes.Card.container,
        border = Recipes.Card.border,
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 16.dp, vertical = 12.dp),
            horizontalArrangement = Arrangement.spacedBy(12.dp),
            verticalAlignment = Alignment.Top,
        ) {
            Column(
                modifier = Modifier.weight(1f),
                verticalArrangement = Arrangement.spacedBy(spacing.elementGapSm / 2),
            ) {
                Text(
                    text = tool.name,
                    style = type.xs.copy(fontWeight = FontWeight.Bold),
                    color = RoyColors.foreground,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                tool.description?.let { description ->
                    Text(
                        text = description,
                        style = type.xs,
                        color = RoyColors.mutedForeground,
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    Badge(
                        label =
                            if (tool.readOnly) McpConnectionCopy.TOOL_READS
                            else McpConnectionCopy.TOOL_WRITES,
                        tone = if (tool.readOnly) RoyColors.mutedForeground else RoyColors.warning,
                    )
                    if (tool.stale) {
                        Badge(label = McpConnectionCopy.TOOL_STALE, tone = RoyColors.destructive)
                    }
                }
            }

            TogglePill(
                on = tool.enabled,
                busy = busy,
                enabled = enabled,
                testTag = ConnectionMetrics.TOOL_SWITCH,
                onClick = onToggle,
            )
        }
    }
}

/** The connection's on/off switch, in the site's two looks. */
@Composable
private fun TogglePill(
    on: Boolean,
    busy: Boolean,
    enabled: Boolean = true,
    testTag: String = ConnectionMetrics.ENABLED,
    onClick: () -> Unit,
) {
    val type = LocalRoyTypeScale.current
    val shape = RoundedCornerShape(percent = 50)

    Row(
        modifier =
            Modifier.clip(shape)
                .background(
                    if (on) RoyColors.primary.copy(alpha = 0.1f) else RoyColors.muted.copy(alpha = 0.4f)
                )
                .border(
                    1.dp,
                    if (on) RoyColors.primary.copy(alpha = 0.4f) else RoyColors.border.copy(alpha = 0.6f),
                    shape,
                )
                .clickable(enabled = enabled && !busy, onClick = onClick)
                .semantics { role = Role.Button; selected = on }
                .testTag(testTag)
                .padding(horizontal = 12.dp, vertical = 6.dp),
        horizontalArrangement = Arrangement.spacedBy(6.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(
            imageVector = if (busy) LucideVectors.Loader2 else LucideVectors.Check,
            contentDescription = null,
            tint = if (on) RoyColors.primary else RoyColors.mutedForeground,
            modifier = Modifier.size(Recipes.Glyph.sm),
        )
        Text(
            text =
                if (on) McpConnectionCopy.CONNECTION_ENABLED else McpStoreCopy.CONNECTION_DISABLED,
            style = type.xs.copy(fontWeight = FontWeight.Bold),
            color = if (on) RoyColors.primary else RoyColors.mutedForeground,
            maxLines = 1,
        )
    }
}

/** One permission level: a radio the page draws as a chip. */
@Composable
private fun LevelButton(
    modifier: Modifier,
    level: MarketplacePermission,
    active: Boolean,
    enabled: Boolean,
    onClick: () -> Unit,
) {
    val type = LocalRoyTypeScale.current
    Row(
        modifier =
            modifier
                .clip(RoundedCornerShape(12.dp))
                .background(
                    if (active) RoyColors.primary.copy(alpha = 0.1f) else Recipes.Card.container
                )
                .border(
                    1.dp,
                    if (active) RoyColors.primary.copy(alpha = 0.4f) else RoyColors.border.copy(alpha = 0.6f),
                    RoundedCornerShape(12.dp),
                )
                .clickable(enabled = enabled, onClick = onClick)
                .semantics { role = Role.RadioButton; selected = active }
                .testTag("${ConnectionMetrics.LEVEL}-${level.name.lowercase()}")
                .padding(horizontal = 12.dp, vertical = 8.dp),
        horizontalArrangement = Arrangement.Center,
    ) {
        Text(
            text =
                when (level) {
                    MarketplacePermission.ASK -> McpStoreCopy.PERMISSION_ASK
                    MarketplacePermission.READS -> McpStoreCopy.PERMISSION_READS
                    MarketplacePermission.ALL -> McpStoreCopy.PERMISSION_ALL
                },
            style = type.xs.copy(fontWeight = FontWeight.Bold),
            color = if (active) RoyColors.primary else RoyColors.mutedForeground,
            maxLines = 2,
            textAlign = TextAlign.Center,
        )
    }
}

/** A quiet pill: a retry, a widen, a save. */
@Composable
private fun PillButton(
    label: String,
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    onClick: () -> Unit,
    testTag: String,
    busy: Boolean = false,
    enabled: Boolean = true,
) {
    val type = LocalRoyTypeScale.current
    Row(
        modifier =
            Modifier.clip(RoundedCornerShape(12.dp))
                .border(1.dp, RoyColors.border.copy(alpha = 0.6f), RoundedCornerShape(12.dp))
                .clickable(enabled = enabled && !busy, onClick = onClick)
                .semantics { role = Role.Button }
                .testTag(testTag)
                .padding(horizontal = 12.dp, vertical = 8.dp),
        horizontalArrangement = Arrangement.spacedBy(6.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(
            imageVector = if (busy) LucideVectors.Loader2 else icon,
            contentDescription = null,
            tint = if (enabled) RoyColors.foreground else RoyColors.mutedForeground,
            modifier = Modifier.size(Recipes.Glyph.sm),
        )
        Text(
            text = label,
            style = type.xs.copy(fontWeight = FontWeight.Bold),
            color = if (enabled) RoyColors.foreground else RoyColors.mutedForeground,
            maxLines = 1,
        )
    }
}

/** The success banner a return from the provider lands on. */
@Composable
private fun Banner(message: String) {
    Row(
        modifier =
            Modifier.fillMaxWidth()
                .background(RoyColors.primary.copy(alpha = 0.1f), Recipes.Card.radius)
                .border(1.dp, RoyColors.primary.copy(alpha = 0.3f), Recipes.Card.radius)
                .testTag(ConnectionMetrics.BANNER)
                .padding(horizontal = 16.dp, vertical = 12.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(
            imageVector = LucideVectors.Check,
            contentDescription = null,
            tint = RoyColors.primary,
            modifier = Modifier.size(Recipes.Glyph.sm),
        )
        Text(
            text = message,
            style = LocalRoyTypeScale.current.small.copy(fontWeight = FontWeight.Bold),
            color = RoyColors.primary,
        )
    }
}

/** One sentence and its glyph: a warning, a danger, or the server's own words. */
@Composable
private fun Notice(text: String, tone: androidx.compose.ui.graphics.Color) {
    Row(
        modifier =
            Modifier.fillMaxWidth()
                .background(tone.copy(alpha = 0.08f), Recipes.Card.radius)
                .border(1.dp, tone.copy(alpha = 0.3f), Recipes.Card.radius)
                .padding(horizontal = 16.dp, vertical = 12.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalAlignment = Alignment.Top,
    ) {
        Icon(
            imageVector = LucideVectors.AlertTriangle,
            contentDescription = null,
            tint = tone,
            modifier = Modifier.size(Recipes.Glyph.sm),
        )
        Text(
            text = text,
            style = LocalRoyTypeScale.current.small.copy(fontWeight = FontWeight.Bold),
            color = tone,
        )
    }
}

/** The page's card surface, for a sentence that needs one. */
@Composable
private fun Card(
    modifier: Modifier = Modifier,
    tone: androidx.compose.ui.graphics.Color,
    content: @Composable () -> Unit,
) {
    Surface(
        modifier = modifier,
        shape = Recipes.Card.radius,
        color = Recipes.Card.container,
        border = BorderStroke(1.dp, tone.copy(alpha = 0.5f)),
    ) {
        Box(Modifier.padding(Recipes.Card.padding(LocalRoySpacing.current))) { content() }
    }
}

/**
 * The guest's one card and its way in, exactly as the page draws it: the
 * sentence over the site's gradient pill, a `gap-4` apart.
 *
 * The pill is [Recipes.Cta], not a local button, because the page's guest action
 * is `.roy-cta` (52px tall, 176px minimum, radius 9999). The body keeps the
 * page's `leading-relaxed` (1.625), so the two clients' paragraph is the same
 * height and the action lands at the same distance below it.
 */
@Composable
private fun SignedOut(modifier: Modifier, onSignIn: () -> Unit) {
    val type = LocalRoyTypeScale.current

    Column(
        // The page's container is `max-w-3xl px-4`: at a phone width the
        // sentence is measured against 361px, not 393, and that width is what
        // decides where it wraps.
        modifier =
            modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp)
                .testTag(ConnectionMetrics.SIGNED_OUT),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        Text(
            text = McpStoreCopy.SIGN_IN_BODY,
            style = type.small.copy(lineHeight = 1.625.em),
            color = RoyColors.mutedForeground,
            textAlign = TextAlign.Center,
            modifier = Modifier.testTag(ConnectionMetrics.SIGN_IN_BODY),
        )
        Box(
            modifier =
                Modifier.height(Recipes.Cta.height)
                    .widthIn(min = Recipes.Cta.minWidth)
                    .shadow(
                        elevation = Recipes.Cta.bloomY,
                        shape = Recipes.Cta.radius,
                        ambientColor = Recipes.Cta.bloom,
                        spotColor = Recipes.Cta.bloom,
                    )
                    .clip(Recipes.Cta.radius)
                    .background(Brush.horizontalGradient(Recipes.Cta.stops))
                    .border(Recipes.Cta.border, Recipes.Cta.radius)
                    .clickable(onClick = onSignIn)
                    .semantics { role = Role.Button }
                    .testTag(ConnectionMetrics.SIGN_IN_ACTION)
                    .padding(horizontal = Recipes.Cta.paddingX),
            contentAlignment = Alignment.Center,
        ) {
            Text(
                text = McpStoreCopy.SIGN_IN,
                style = Recipes.Cta.text(type),
                color = Recipes.Cta.content,
                maxLines = 1,
            )
        }
    }
}

/** The loading state: two pulsing blocks, the page's skeleton. */
@Composable
private fun Skeleton(modifier: Modifier) {
    val transition = rememberInfiniteTransition(label = "connection-skeleton")
    val alpha by
        transition.animateFloat(
            initialValue = Recipes.Skeleton.pulseFrom,
            targetValue = Recipes.Skeleton.pulseTo,
            animationSpec =
                infiniteRepeatable(
                    animation = tween(Recipes.Skeleton.pulseMs),
                    repeatMode = RepeatMode.Reverse,
                ),
            label = "connection-skeleton-alpha",
        )

    Column(
        modifier =
            modifier
                .fillMaxWidth()
                .alpha(alpha)
                .testTag(ConnectionMetrics.SKELETON)
                .semantics { contentDescription = McpStoreCopy.LOADING_LABEL },
        verticalArrangement = Arrangement.spacedBy(Recipes.Skeleton.gap),
    ) {
        repeat(2) {
            Box(
                Modifier.fillMaxWidth().height(80.dp).clip(Recipes.Skeleton.radius).background(
                    Recipes.Skeleton.fill
                )
            )
        }
    }
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

/**
 * The connection screen's handles and geometry (#1256).
 *
 * The numbers are the page's: `space-y-6` between sections, `rounded-2xl` cards,
 * and the level chips as a three-column grid on a phone.
 */
internal object ConnectionMetrics {
    const val SCREEN = "connection-screen"
    const val TITLE = "connection-title"
    const val BANNER = "connection-banner"
    const val NOT_FOUND = "connection-not-found"
    const val SIGNED_OUT = "connection-signed-out"
    const val SIGN_IN_BODY = "connection-sign-in-body"
    const val SIGN_IN_ACTION = "connection-sign-in"
    const val SKELETON = "connection-skeleton"
    const val RETRY = "connection-retry"
    const val ENABLED = "connection-enabled"
    const val LEVELS = "connection-levels"
    const val LEVEL = "connection-level"
    const val RECONNECT = "connection-reconnect"
    const val WIDEN = "connection-widen"
    const val KEY_FIELD = "connection-key"
    const val KEY_ACTION = "connection-key-action"
    const val TOOL = "connection-tool"
    const val TOOL_SWITCH = "connection-tool-switch"
    const val DISCONNECT = "connection-disconnect"
    const val CONFIRM = "connection-confirm"
    const val CONFIRM_ACTION = "connection-confirm-action"
    const val CONFIRM_CANCEL = "connection-confirm-cancel"

    val sectionGap = 24.dp
}
