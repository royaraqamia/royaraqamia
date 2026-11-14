package com.royaraqamia.app.notifications

import com.royaraqamia.app.contracts.generated.NotificationsResponseNotificationsItem
import com.royaraqamia.app.contracts.generated.NotificationsResponseNotificationsItemMetadata
import com.royaraqamia.app.contracts.generated.NotificationsResponseNotificationsItemType
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/**
 * A row's destination is the site's table, in Kotlin (#1391).
 *
 * The page derives it in `notification-target.ts`; this pins the same answers so
 * a row that opens the certificate in the browser cannot open somewhere else in
 * the app, and a type with no identifier still has the surface it is about.
 */
class NotificationsRoutesTest {
    private fun item(
        type: NotificationsResponseNotificationsItemType,
        certificateCode: String? = null,
        conversationId: String? = null,
    ) = NotificationsResponseNotificationsItem(
        id = "n-1",
        user_id = "u-1",
        type = type,
        title = "عنوان",
        body = null,
        metadata =
            NotificationsResponseNotificationsItemMetadata(
                certificateCode = certificateCode,
                conversationId = conversationId,
            ),
        is_read = false,
        created_at = "2026-11-13T00:00:00Z",
        read_at = null,
    )

    @Test
    fun `a certificate opens its verification page`() {
        assertEquals(
            "/verify/C-1",
            NotificationsRoutes.targetOf(
                item(
                    NotificationsResponseNotificationsItemType.CERTIFICATE_ISSUED,
                    certificateCode = "C-1",
                )
            ),
        )
    }

    @Test
    fun `a chat request opens its thread`() {
        assertEquals(
            "/chats/c-1",
            NotificationsRoutes.targetOf(
                item(
                    NotificationsResponseNotificationsItemType.CHAT_REQUEST,
                    conversationId = "c-1",
                )
            ),
        )
    }

    @Test
    fun `a product alert opens its surface without metadata`() {
        assertEquals(
            "/habitflow",
            NotificationsRoutes.targetOf(
                item(NotificationsResponseNotificationsItemType.HABIT_REMINDER)
            ),
        )
        assertEquals(
            "/linksnap",
            NotificationsRoutes.targetOf(item(NotificationsResponseNotificationsItemType.LINK_CLICKED)),
        )
    }

    @Test
    fun `an announcement with nowhere to go answers null`() {
        assertNull(
            NotificationsRoutes.targetOf(
                item(NotificationsResponseNotificationsItemType.SYSTEM_ANNOUNCEMENT)
            )
        )
    }

    @Test
    fun `an identifier is encoded as a path segment`() {
        assertEquals(
            "/verify/A%2FB",
            NotificationsRoutes.targetOf(
                item(
                    NotificationsResponseNotificationsItemType.CERTIFICATE_ISSUED,
                    certificateCode = "A/B",
                )
            ),
        )
    }
}
