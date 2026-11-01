package com.royaraqamia.app.shell

/**
 * The notification bell's two drawn states (#659), as the parity row names them.
 *
 * The control is either silent - a bell and nothing else - or it carries a count,
 * and the words it is announced with differ for the two. Both are generated
 * (`shared/copy/notification-bell.json`), so this file exists for the pair check
 * to read, not for a screen to branch on.
 */
sealed interface NotificationBellState {
    /** No unread notifications: the bell, and the plain name. */
    data object Idle : NotificationBellState

    /** Something is unread: the count, and a name that says how many. */
    data object Unread : NotificationBellState
}
