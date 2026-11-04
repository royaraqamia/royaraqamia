package com.royaraqamia.app.account

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import com.royaraqamia.app.theme.LocalRoySpacing

/**
 * The site's `/account` as a screen (#948).
 *
 * This slice is the page's action rows and its sign-out; the profile card
 * ([#946]) and the allowance card ([#947]) are the other slices, so the surface
 * stays off in `docs/mobile/screens.json` until the page is whole and the visual
 * gate passes. The shell still routes here, which is what lets the pieces land
 * one at a time rather than as a second, half-drawn page.
 *
 * The rows themselves are [AccountRows], the listed pair; this screen owns only
 * the page's scroll and its padding, so it can grow the remaining cards without
 * touching the component the gate measures.
 *
 * [#946]: https://github.com/royaraqamia/royaraqamia/issues/946
 * [#947]: https://github.com/royaraqamia/royaraqamia/issues/947
 */
@Composable
fun AccountScreen(
    state: AccountUiState,
    isAdmin: Boolean,
    onOpenRoute: (String) -> Unit,
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
    ) {
        AccountRows(
            state = state,
            isAdmin = isAdmin,
            onOpenRoute = onOpenRoute,
            onSignOut = onSignOut,
        )
    }
}
