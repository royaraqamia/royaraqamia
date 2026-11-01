package com.royaraqamia.app.connectedapps

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextAlign
import com.royaraqamia.app.contracts.ApiError
import com.royaraqamia.app.contracts.ApiResult
import com.royaraqamia.app.theme.LocalRoySpacing
import com.royaraqamia.app.theme.LocalRoyTypeScale
import com.royaraqamia.app.theme.RoyColors
import kotlinx.coroutines.launch

/**
 * The site's `/account/connected-apps` as a screen (#657).
 *
 * The page: its title, then [ConnectedAppsCard] — the pair — under it. The screen
 * owns what the page's view owns around the card: when to read, and what a revoke
 * that the server refused leaves on screen.
 *
 * Two rules come straight from the view and are the reason this is not just the
 * card wrapped in a column:
 *
 * - a granted client is read from the server on arrival, because the list is the
 *   server's record of what is still live;
 * - a revoke that fails keeps the server's own words and does **not** re-read,
 *   while a revoke that succeeds re-reads rather than dropping the row locally —
 *   a revocation that half-succeeded must not look complete.
 */
@Composable
fun ConnectedAppsScreen(
    repository: ConnectedAppsRepository,
    signedIn: Boolean,
    onSignIn: () -> Unit,
    onConnectNew: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val spacing = LocalRoySpacing.current
    val type = LocalRoyTypeScale.current
    val scope = rememberCoroutineScope()
    var state by remember { mutableStateOf<ConnectedAppsUiState>(ConnectedAppsUiState.Loading) }
    var actionError by remember { mutableStateOf<String?>(null) }

    suspend fun read() {
        state = ConnectedAppsUiState.Loading
        state = ConnectedAppsUiState.from(repository.list())
    }

    /**
     * One revoke, then the server's list again on success. A refusal is shown in
     * the card's alert and nothing is re-read: the row is still there, and a
     * reload would silently replace the reason with the unchanged list.
     */
    fun revoke(request: suspend () -> ApiResult<Unit>) {
        scope.launch {
            when (val result = request()) {
                is ApiResult.Failure ->
                    actionError = (result.error as? ApiError.Server)?.detail ?: ConnectedAppsCopy.DISCONNECT_FAILED
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
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = spacing.elementGap, vertical = spacing.elementGapSm),
        verticalArrangement = Arrangement.spacedBy(spacing.elementGap),
    ) {
        Text(
            text = ConnectedAppsCopy.PAGE_TITLE,
            modifier = Modifier.fillMaxWidth(),
            style = type.h2,
            color = RoyColors.primary,
            textAlign = TextAlign.Center,
        )

        ConnectedAppsCard(
            state = state,
            actionError = actionError,
            onRetry = { scope.launch { read() } },
            onSignIn = onSignIn,
            onDisconnect = { app -> revoke { repository.disconnect(app.clientId) } },
            onDisconnectAll = { revoke { repository.disconnectAll() } },
            onConnectNew = onConnectNew,
        )
    }
}
