package com.royaraqamia.app.spendtrack

import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import com.royaraqamia.app.store.spendtrack.SpendtrackRepository

/**
 * The categories route (#959), the app's half of
 * `app/spendtrack/(app)/categories`.
 *
 * The drawing is [SpendtrackScreen]'s categories branch: the two routes share
 * the store, the sync pill and the dialogs, and the surface matrix gives them a
 * row each. This screen is the route's own name, so `/spendtrack/categories`
 * flips on its own gate row rather than riding the dashboard's.
 */
@Composable
fun SpendtrackCategoriesScreen(
    repository: SpendtrackRepository,
    modifier: Modifier = Modifier,
) {
    SpendtrackScreen(
        route = CATEGORIES_ROUTE,
        repository = repository,
        modifier = modifier,
    )
}
