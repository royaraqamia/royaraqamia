package com.royaraqamia.app.plans

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
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
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import com.royaraqamia.app.theme.LocalRoySpacing
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
                .background(RoyColors.background)
                .verticalScroll(rememberScrollState())
                .padding(horizontal = spacing.elementGap, vertical = spacing.elementGapSm),
        verticalArrangement = Arrangement.spacedBy(PlanScreenMetrics.titleToCard),
    ) {
        Text(
            text = PlanCardCopy.PAGE_TITLE,
            modifier =
                Modifier.fillMaxWidth()
                    .height(PlanScreenMetrics.titleHeight)
                    .testTag(PlanScreenMetrics.TITLE),
            style =
                TextStyle(
                    fontSize = PlanScreenMetrics.titleSize,
                    lineHeight = PlanScreenMetrics.titleLineHeight,
                    fontWeight = PlanScreenMetrics.titleWeight,
                    letterSpacing = PlanScreenMetrics.titleTracking,
                    textAlign = TextAlign.Center,
                ),
            color = RoyColors.primary,
        )

        PlanCard(
            state = state,
            onRetry = { scope.launch { read() } },
            onSignIn = onSignIn,
        )
    }
}

/**
 * The page's own numbers, which the visual gate compares box by box
 * (`shared/visual/account-plan.json`, ADR-0118).
 *
 * The title is `SectionTitle`'s `text-3xl font-extrabold` with the highlight's
 * `py-[0.15em]`, so 30sp on a 46.5sp line; the card is the site's
 * `rounded-2xl card-padding border-border/50 bg-card/60`; and the guest
 * prompt's two sentences are `text-base font-bold` over `text-xs`.
 */
internal object PlanScreenMetrics {
    const val TITLE = "plan-title"
    const val CARD = "plan-card"
    const val MARK = "plan-mark"
    const val SIGN_IN_TITLE = "plan-sign-in-title"
    const val SIGN_IN_BODY = "plan-sign-in-body"
    const val CTA = "plan-cta"

    val titleSize = 30.sp
    val titleLineHeight = 46.5.sp
    val titleHeight = 46.5.dp
    val titleWeight = FontWeight.ExtraBold
    val titleTracking = (-0.025).em
    val titleToCard = 40.dp

    val cardBorder = 1.dp
    val cardGap = 12.dp

    val markSize = 56.dp
    val textGap = 4.dp
    val signInTitleSize = 16.sp
    val signInTitleLineHeight = 24.sp
    val signInTitleHeight = 24.dp
    val signInTitleWeight = FontWeight.Bold
    val signInBodySize = 12.sp
    val signInBodyLineHeight = 16.sp
    val signInBodyHeight = 16.dp
    val ctaToText = 16.dp
}
