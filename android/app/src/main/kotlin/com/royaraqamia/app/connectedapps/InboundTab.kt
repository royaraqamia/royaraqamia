package com.royaraqamia.app.connectedapps

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.dp
import com.royaraqamia.app.contracts.ApiError
import com.royaraqamia.app.contracts.ApiResult
import com.royaraqamia.app.theme.LocalRoySpacing
import kotlinx.coroutines.launch

/**
 * The clients connected to our MCP server, as the third tab of the apps sheet
 * (#1256, ADR-0159).
 *
 * The site's half is `frontend/ui/apps/inbound-tab.tsx`, which is the account
 * page's view with the heading off and the surface's search term passed in — this
 * is the same decision: [ConnectedAppsCard] is the pair, and the tab adds only
 * the host's two things, when to read and what a refused revoke leaves on screen.
 *
 * The read is the page's (`mcp-connected-apps-view.tsx`, `apps-cache.ts`): the
 * session cache seeds the list so a reopen draws rows instead of a skeleton, and
 * the read still runs so a stale row never stands as the answer. A revoke that
 * succeeds re-reads rather than dropping the row locally, because a revocation
 * that half-succeeded must not look complete.
 */
@Composable
fun InboundTab(
    repository: ConnectedAppsRepository,
    signedIn: Boolean,
    query: String,
    onSignIn: () -> Unit,
    onConnectNew: () -> Unit,
    modifier: Modifier = Modifier,
    /**
     * Whether the panel scrolls itself (#1256): the sheet's body does, a page
     * scrolls as one document and the panel is then only its content.
     */
    scroll: Boolean = true,
) {
    val spacing = LocalRoySpacing.current
    val scope = rememberCoroutineScope()
    var state by remember {
        mutableStateOf<ConnectedAppsUiState>(
            repository.cached()?.let { ConnectedAppsUiState.Ready(it) }
                ?: ConnectedAppsUiState.Loading
        )
    }
    var actionError by remember { mutableStateOf<String?>(null) }

    suspend fun read() {
        // The cached rows are what the member is reading; keeping them on screen
        // while the revalidation runs is what makes a reopen instant.
        state = ConnectedAppsUiState.from(repository.list())
    }

    fun revoke(request: suspend () -> ApiResult<Unit>) {
        scope.launch {
            when (val result = request()) {
                is ApiResult.Failure ->
                    actionError =
                        (result.error as? ApiError.Server)?.detail
                            ?: ConnectedAppsCopy.DISCONNECT_FAILED
                is ApiResult.Success -> {
                    actionError = null
                    read()
                }
            }
        }
    }

    LaunchedEffect(repository, signedIn) {
        // No session is the card's guest prompt, not a failed read — the same
        // distinction the page makes.
        if (signedIn) read() else state = ConnectedAppsUiState.SignedOut
    }

    Column(
        modifier =
            modifier
                .fillMaxWidth()
                .then(
                    if (scroll) Modifier.verticalScroll(rememberScrollState()) else Modifier
                )
                .testTag(InboundMetrics.PANEL)
                .padding(
                    start = if (scroll) spacing.elementGap else 0.dp,
                    end = if (scroll) spacing.elementGap else 0.dp,
                    top = if (scroll) spacing.elementGapSm else 0.dp,
                    bottom = if (scroll) spacing.elementGap else 0.dp,
                ),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        ConnectedAppsCard(
            state = state,
            actionError = actionError,
            onRetry = { scope.launch { read() } },
            onSignIn = onSignIn,
            onDisconnect = { app -> revoke { repository.disconnect(app.clientId) } },
            onDisconnectAll = { revoke { repository.disconnectAll() } },
            onConnectNew = onConnectNew,
            query = query,
        )
    }
}

/** The tab's handles for the visual contract and its tests (#1256). */
internal object InboundMetrics {
    const val PANEL = "inbound-panel"
}
