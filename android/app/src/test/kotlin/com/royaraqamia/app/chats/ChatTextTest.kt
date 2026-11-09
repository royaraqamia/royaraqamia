package com.royaraqamia.app.chats

import com.royaraqamia.app.contracts.generated.ChatThreadResponseThread
import com.royaraqamia.app.contracts.generated.ChatThreadResponseThreadAttachmentQuota
import com.royaraqamia.app.contracts.generated.ChatThreadResponseThreadAttachmentQuotaProject
import com.royaraqamia.app.contracts.generated.ChatThreadResponseThreadAttachmentQuotaToday
import com.royaraqamia.app.contracts.generated.ChatThreadResponseThreadAttachmentQuotaTotal
import com.royaraqamia.app.contracts.generated.ChatThreadResponseThreadKind
import com.royaraqamia.app.contracts.generated.ChatThreadResponseThreadMe
import com.royaraqamia.app.contracts.generated.ChatThreadResponseThreadMePeer
import com.royaraqamia.app.contracts.generated.ChatThreadResponseThreadMeRole
import com.royaraqamia.app.contracts.generated.ChatThreadResponseThreadMeStatus
import com.royaraqamia.app.contracts.generated.ChatThreadResponseThreadMyStatus
import com.royaraqamia.app.contracts.generated.ChatThreadResponseThreadParticipantsItem
import com.royaraqamia.app.contracts.generated.ChatThreadResponseThreadParticipantsItemPeer
import com.royaraqamia.app.contracts.generated.ChatThreadResponseThreadParticipantsItemRole
import com.royaraqamia.app.contracts.generated.ChatThreadResponseThreadParticipantsItemStatus
import com.royaraqamia.app.contracts.generated.ChatThreadResponseThreadStatus
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import java.time.Instant

/**
 * The thread's words and its arithmetic (#819).
 *
 * The relative time is the surface's own sentence rather than the formatter's
 * (ADR-0104): the thresholds are the shared ones and the words come from the copy
 * source the site renders, so a count that crosses a boundary does so on both
 * clients in the same second. The receipt is the roster's watermark read against
 * one line — no receipt row exists, so the only question is whether it says
 * nothing, «قُرئت» or a count.
 */
class ChatTextTest {
    private val line = "2026-11-01T10:00:00Z"

    private fun peer(id: String) =
        ChatThreadResponseThreadParticipantsItemPeer(
            id = id,
            username = id,
            name = id,
            avatarUrl = null,
            verified = false,
        )

    private fun participant(
        userId: String,
        lastReadAt: String?,
        status: ChatThreadResponseThreadParticipantsItemStatus =
            ChatThreadResponseThreadParticipantsItemStatus.ACTIVE,
    ) =
        ChatThreadResponseThreadParticipantsItem(
            userId = userId,
            role = ChatThreadResponseThreadParticipantsItemRole.MEMBER,
            status = status,
            lastReadAt = lastReadAt,
            joinedAt = null,
            peer = peer(userId),
        )

    private fun thread(
        kind: ChatThreadResponseThreadKind,
        participants: List<ChatThreadResponseThreadParticipantsItem>,
    ) =
        ChatThreadResponseThread(
            id = "c-1",
            kind = kind,
            status = ChatThreadResponseThreadStatus.ACTIVE,
            title = "محادثة",
            counterpart = null,
            myStatus = ChatThreadResponseThreadMyStatus.ACTIVE,
            lastMessage = null,
            unreadCount = 0.0,
            lastMessageAt = null,
            createdAt = line,
            participants = participants,
            me =
                ChatThreadResponseThreadMe(
                    userId = "me",
                    role = ChatThreadResponseThreadMeRole.MEMBER,
                    status = ChatThreadResponseThreadMeStatus.ACTIVE,
                    lastReadAt = null,
                    joinedAt = null,
                    peer = null,
                ),
            blockedByMe = false,
            canWrite = true,
            attachmentQuota =
                ChatThreadResponseThreadAttachmentQuota(
                    fileBytes = 1.0,
                    today =
                        ChatThreadResponseThreadAttachmentQuotaToday(
                            usedBytes = 0.0,
                            limitBytes = 1.0,
                        ),
                    total =
                        ChatThreadResponseThreadAttachmentQuotaTotal(
                            usedBytes = 0.0,
                            limitBytes = 1.0,
                        ),
                    project =
                        ChatThreadResponseThreadAttachmentQuotaProject(
                            usedBytes = 0.0,
                            limitBytes = 1.0,
                        ),
                ),
        )

    @Test
    fun `a past instant is counted in the site's words`() {
        val now = Instant.parse("2026-11-01T12:00:00Z")

        assertEquals(ChatsListCopy.AGO_NOW, ChatText.timeAgo("2026-11-01T11:59:30Z", now))
        assertEquals(
            ChatsListCopy.AGO_MINUTES.replace("{count}", "30"),
            ChatText.timeAgo("2026-11-01T11:30:00Z", now),
        )
        assertEquals(
            ChatsListCopy.AGO_HOURS.replace("{count}", "2"),
            ChatText.timeAgo("2026-11-01T10:00:00Z", now),
        )
        assertEquals(
            ChatsListCopy.AGO_DAYS.replace("{count}", "3"),
            ChatText.timeAgo("2026-10-29T12:00:00Z", now),
        )
    }

    @Test
    fun `a new day is the first line whose date differs`() {
        assertEquals(true, ChatText.isNewDay(null, line))
        assertEquals(false, ChatText.isNewDay("2026-11-01T08:00:00Z", line))
        assertEquals(true, ChatText.isNewDay("2026-10-31T23:00:00Z", line))
    }

    @Test
    fun `a direct receipt waits for the peer's watermark`() {
        val before =
            thread(
                ChatThreadResponseThreadKind.DIRECT,
                listOf(participant("me", null), participant("peer", "2026-11-01T09:59:59Z")),
            )
        val past =
            thread(
                ChatThreadResponseThreadKind.DIRECT,
                listOf(participant("me", null), participant("peer", "2026-11-01T10:00:01Z")),
            )

        assertNull(ChatText.receiptOf(before, line, mine = true, deleted = false))
        assertEquals(ChatThreadCopy.READ_RECEIPT, ChatText.receiptOf(past, line, mine = true, deleted = false))
        // Nobody's own line reads as read to itself, and a tombstone carries none.
        assertNull(ChatText.receiptOf(past, line, mine = false, deleted = false))
        assertNull(ChatText.receiptOf(past, line, mine = true, deleted = true))
    }

    @Test
    fun `a group thread carries no receipt, because its UI is hidden`() {
        val thread =
            thread(
                ChatThreadResponseThreadKind.GROUP,
                listOf(
                    participant("me", "2026-11-01T10:00:01Z"),
                    participant("peer", "2026-11-01T10:00:01Z"),
                ),
            )

        assertNull(ChatText.receiptOf(thread, line, mine = true, deleted = false))
    }

    @Test
    fun `the roster draws the seats that hold one`() {
        val roster =
            thread(
                ChatThreadResponseThreadKind.GROUP,
                listOf(
                    participant("me", null),
                    participant("peer", null),
                    participant(
                        "peer-2",
                        null,
                        ChatThreadResponseThreadParticipantsItemStatus.LEFT,
                    ),
                ),
            )

        assertEquals(listOf("me", "peer"), ChatText.membersOf(roster).map { it.userId })
    }
}
