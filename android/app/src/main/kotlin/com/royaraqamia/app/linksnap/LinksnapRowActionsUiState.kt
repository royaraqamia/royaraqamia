package com.royaraqamia.app.linksnap

/**
 * What one owned-link row's toolbar is showing (#943).
 *
 * The toolbar has one face because the row it belongs to is painted from the
 * store: [AtRest] is the page's resting toolbar, and the copied and expanded
 * faces are arguments of the composable rather than states of their own. The
 * state is declared so the pair list can name the component both clients draw.
 */
sealed interface LinksnapRowActionsUiState {
    data object AtRest : LinksnapRowActionsUiState
}
