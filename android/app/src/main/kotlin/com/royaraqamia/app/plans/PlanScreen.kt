package com.royaraqamia.app.plans

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
import com.royaraqamia.app.theme.LocalRoySpacing
import com.royaraqamia.app.theme.LocalRoyTypeScale
import com.royaraqamia.app.theme.RoyColors
import kotlinx.coroutines.launch

/**
 * The site's `/account/plan` as a screen (#657).
 *
 * It is the page, not the card: the page's title, and then [PlanCard] — which was
 * already the pair ([docs/mobile/parity.json]) — under it. Everything the page
 * decides lives in the card's four states, and the read is the repository the
 * page reads (`GET /api/me/plan`), so the screen itself owns only two things: when
 * to read, and what a guest sees.
 *
 * It reads on every arrival and whenever the session answers, because a plan is a
 * server fact that a cached screen would show stale: a member who upgraded on the
 * web must not see the free plan until the process restarts.
 *
 * The title is generated copy ([PlanCardCopy.PAGE_TITLE]) drawn in the site's
 * largest heading and its highlight tone, which is what `SectionTitle` is on the
 * page.
 */
@Composable
fun PlanScreen(
    repository: UsageRepository,
    signedIn: Boolean,
    onSignIn: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val spacing = LocalRoySpacing.current
    val type = LocalRoyTypeScale.current
    val scope = rememberCoroutineScope()
    var state by remember { mutableStateOf<UsageUiState>(UsageUiState.Loading) }

    suspend fun read() {
        state = UsageUiState.Loading
        state = UsageUiState.from(repository.load())
    }

    LaunchedEffect(repository, signedIn) {
        // No session is not a failed read: it is the card's guest prompt, exactly
        // as the page decides it.
        if (signedIn) read() else state = UsageUiState.SignedOut
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
            text = PlanCardCopy.PAGE_TITLE,
            modifier = Modifier.fillMaxWidth(),
            style = type.h2,
            color = RoyColors.primary,
            textAlign = TextAlign.Center,
        )

        PlanCard(
            state = state,
            onRetry = { scope.launch { read() } },
            onSignIn = onSignIn,
        )
    }
}
