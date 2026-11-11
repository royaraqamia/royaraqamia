package com.royaraqamia.app.account

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
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
import androidx.compose.ui.unit.dp
import androidx.compose.ui.Modifier
import com.royaraqamia.app.contracts.ApiResult
import com.royaraqamia.app.theme.LocalRoySpacing
import kotlinx.coroutines.launch

/**
 * The site's `/account` as a screen (#948).
 *
 * This slice is the page's profile card (#946), its allowance card (#947), its
 * action rows and its sign-out; the public handle editor is still the page's,
 * so the surface stays off in `docs/mobile/screens.json` until the page is
 * whole and the visual gate passes. The shell still routes here, which is what
 * lets the pieces land one at a time rather than as a second, half-drawn page.
 *
 * The rows themselves are [AccountRows], the profile is [AccountProfileCard] and
 * the allowance is [AccountUsageCard]; this screen owns only the page's scroll,
 * its padding and the two reads, so it can grow without touching the components
 * the gate measures.
 *
 * [#946]: https://github.com/royaraqamia/royaraqamia/issues/946
 * [#947]: https://github.com/royaraqamia/royaraqamia/issues/947
 */
@Composable
fun AccountScreen(
    state: AccountUiState,
    isAdmin: Boolean,
    profileRepository: AccountProfileRepository,
    usageRepository: AccountUsageRepository,
    onOpenRoute: (String) -> Unit,
    onSignIn: () -> Unit,
    onSignOut: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val spacing = LocalRoySpacing.current

    Column(
        modifier =
            modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = spacing.elementGap, vertical = spacing.elementGapSm),
        // The page stacks the card and the rows with `space-y-6` (24px).
        verticalArrangement = Arrangement.spacedBy(24.dp),
    ) {
        if (state is AccountUiState.Member) {
            AccountProfileRoute(repository = profileRepository)
            // The page stacks the allowance under the profile and above the
            // rows; a visitor gets no card at all, so it is drawn only for a
            // member — the same decision `UsageCard` makes from its session.
            AccountUsageRoute(
                repository = usageRepository,
                onOpenRoute = onOpenRoute,
            )
        }

        AccountRows(
            state = state,
            isAdmin = isAdmin,
            onOpenRoute = onOpenRoute,
            onSignIn = onSignIn,
            onSignOut = onSignOut,
        )
    }
}

/**
 * The card's read (#946): `/api/me`, the same route the page's session provider
 * reads, so the app's name and avatar are the row's own rather than the token's.
 *
 * A read that has not answered is the page's skeleton; a read that failed is the
 * page's fallbacks (the email when the row gave nothing), because a failed
 * profile read is not a sentence the site has a place for (ADR-0031).
 */
@Composable
private fun AccountProfileRoute(
    repository: AccountProfileRepository,
    modifier: Modifier = Modifier,
) {
    var profile by remember { mutableStateOf<AccountProfile?>(null) }
    var loaded by remember { mutableStateOf(false) }

    LaunchedEffect(repository) {
        profile =
            when (val result = repository.profile()) {
                is ApiResult.Success ->
                    AccountProfile(
                        name = result.value.name,
                        email = result.value.email,
                        avatarUrl = result.value.avatarUrl,
                    )
                is ApiResult.Failure -> AccountProfile(name = null, email = null, avatarUrl = null)
            }
        loaded = true
    }

    val current = profile
    if (!loaded || current == null) {
        AccountProfileSkeleton(modifier = modifier)
    } else {
        AccountProfileCard(
            profile = current,
            repository = repository,
            modifier = modifier,
            onChanged = { profile = it },
        )
    }
}

/**
 * The allowance card's read (#947): `/api/me/usage`, the route the page's
 * `UsageCard` reads. It is drawn only for a member, so the read is never spent
 * on a request the server would answer 401.
 *
 * A retry re-reads the same route; the card itself is a function of the state,
 * which is what lets its own test hold every face without a socket.
 */
@Composable
private fun AccountUsageRoute(
    repository: AccountUsageRepository,
    onOpenRoute: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    val scope = rememberCoroutineScope()
    var state by remember { mutableStateOf<AccountUsageUiState>(AccountUsageUiState.Loading) }

    suspend fun read() {
        state = AccountUsageUiState.Loading
        state = AccountUsageUiState.from(repository.load())
    }

    LaunchedEffect(repository) { read() }

    AccountUsageCard(
        state = state,
        onOpenRoute = onOpenRoute,
        onRetry = { scope.launch { read() } },
        modifier = modifier,
    )
}
