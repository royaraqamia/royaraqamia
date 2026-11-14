package com.royaraqamia.app.notifications

import com.royaraqamia.app.api.ApiClient
import com.royaraqamia.app.contracts.ApiResult
import com.royaraqamia.app.contracts.generated.NotificationsResponse
import com.royaraqamia.app.contracts.generated.NotificationsResponseNotificationsItem
import com.royaraqamia.app.contracts.generated.UnreadNotificationCount

/**
 * The notification centre (#659, #1391): the bell's number and the feed it opens.
 *
 * One route, one shape: `/api/notifications` is the same page the site's
 * `NotificationContext` reads, and the same generated contract (`NotificationsResponse`),
 * so a row the browser draws and a row the app draws are the same row. The bell's
 * number comes from the page's own unread count route, so a bell that says 3 on
 * the phone says 3 in the browser.
 *
 * The writes are the page's own three (`PATCH` one, `PATCH` all, `DELETE` one).
 * They are requests rather than local edits: the screen re-reads the list after
 * each, because the server is the record of what is still unread.
 */
class NotificationsRepository(private val client: ApiClient) {
    /** The unread count, or why it could not be read. */
    suspend fun unreadCount(): ApiResult<Int> =
        when (val result = client.get<UnreadNotificationCount>(UNREAD_COUNT_PATH)) {
            is ApiResult.Success -> ApiResult.Success(result.value.count.toInt())
            is ApiResult.Failure -> result
        }

    /** The newest 20 rows, in the server's order. */
    suspend fun list(): ApiResult<List<NotificationsResponseNotificationsItem>> =
        when (val result = client.get<NotificationsResponse>(PATH)) {
            is ApiResult.Success -> ApiResult.Success(result.value.notifications)
            is ApiResult.Failure -> result
        }

    suspend fun markRead(id: String): ApiResult<Unit> = write("PATCH", itemPath(id))

    suspend fun markAllRead(): ApiResult<Unit> = write("PATCH", PATH)

    suspend fun delete(id: String): ApiResult<Unit> = write("DELETE", itemPath(id))

    private suspend fun write(method: String, path: String): ApiResult<Unit> =
        when (val result = client.send(method, path)) {
            is ApiResult.Success -> ApiResult.Success(Unit)
            is ApiResult.Failure -> result
        }

    companion object {
        const val PATH = "/api/notifications"
        const val UNREAD_COUNT_PATH = "/api/notifications/unread-count"

        /** What the badge shows past this: the site's own `99+`. */
        const val MAX_BADGE = 99

        fun itemPath(id: String): String = "$PATH/$id"
    }
}
