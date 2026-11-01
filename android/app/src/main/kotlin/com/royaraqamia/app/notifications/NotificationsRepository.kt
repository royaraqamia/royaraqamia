package com.royaraqamia.app.notifications

import com.royaraqamia.app.api.ApiClient
import com.royaraqamia.app.contracts.ApiResult
import com.royaraqamia.app.contracts.generated.UnreadNotificationCount

/**
 * The number the top bar's bell draws (#659).
 *
 * One route, one number: `/api/notifications/unread-count`, the same one the
 * site's `NotificationProvider` reads, and the same generated contract
 * (`UnreadNotificationCount`), so a bell that says 3 on the phone says 3 in the
 * browser. A guest is answered zero rather than refused, which is why the shell
 * only asks after the session answers - a count is chrome, and chrome for nobody
 * is nothing.
 *
 * Read-only on purpose: marking read belongs to the notifications page, which is
 * still the document (#659), so a write path here would be a second client of a
 * state the user cannot see natively.
 */
class NotificationsRepository(private val client: ApiClient) {
    /** The unread count, or why it could not be read. */
    suspend fun unreadCount(): ApiResult<Int> =
        when (val result = client.get<UnreadNotificationCount>(PATH)) {
            is ApiResult.Success -> ApiResult.Success(result.value.count.toInt())
            is ApiResult.Failure -> result
        }

    companion object {
        const val PATH = "/api/notifications/unread-count"

        /** What the badge shows past this: the site's own `99+`. */
        const val MAX_BADGE = 99
    }
}
