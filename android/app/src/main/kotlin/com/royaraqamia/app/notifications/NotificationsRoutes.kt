package com.royaraqamia.app.notifications

import com.royaraqamia.app.contracts.generated.NotificationsResponseNotificationsItem
import com.royaraqamia.app.contracts.generated.NotificationsResponseNotificationsItemType

/**
 * Where a notification row leads (#1391).
 *
 * The rows carry no URL: `metadata` holds the identifier the producer had at
 * hand (`certificateCode`, `conversationId`), so the mapping lives here, in one
 * table, rather than being re-derived at each call site. It is the app's half of
 * the site's `frontend/ui/notifications/notification-target.ts`; the two tables
 * answer the same path for the same type, and a type the producer never gave an
 * identifier still has the surface it is about. A type with neither answers
 * `null`, which the screen renders as a row that only marks itself read.
 *
 * `/verify/<code>` and `/chats/<id>` take the identifier in the path, so it is
 * encoded: a code or id that reached the database through a form is user data.
 */
object NotificationsRoutes {
    fun targetOf(item: NotificationsResponseNotificationsItem): String? =
        when (item.type) {
            NotificationsResponseNotificationsItemType.CERTIFICATE_ISSUED ->
                item.metadata.certificateCode?.let { "/verify/${encode(it)}" }
            NotificationsResponseNotificationsItemType.CHAT_REQUEST ->
                item.metadata.conversationId?.let { "/chats/${encode(it)}" }
            NotificationsResponseNotificationsItemType.HABIT_REMINDER,
            NotificationsResponseNotificationsItemType.RECOVERY_NUDGE -> "/habitflow"
            NotificationsResponseNotificationsItemType.EXPENSE_ALERT -> "/spendtrack"
            NotificationsResponseNotificationsItemType.LINK_CLICKED -> "/linksnap"
            NotificationsResponseNotificationsItemType.TRAINING_APPLICATION ->
                "/admin/training/applications"
            NotificationsResponseNotificationsItemType.CONSULTATION_BOOKING ->
                "/admin/consultations/bookings"
            NotificationsResponseNotificationsItemType.PROJECT_REQUEST ->
                "/admin/clients/project-requests"
            NotificationsResponseNotificationsItemType.RETAINER_REQUEST ->
                "/admin/clients/retainers"
            NotificationsResponseNotificationsItemType.SUBSCRIPTION_REQUEST ->
                "/admin/plans/requests"
            NotificationsResponseNotificationsItemType.SYSTEM_ANNOUNCEMENT,
            NotificationsResponseNotificationsItemType.NEW_FOLLOWER -> null
        }

    private fun encode(value: String): String =
        runCatching { java.net.URLEncoder.encode(value, "UTF-8") }.getOrElse { value }
}
