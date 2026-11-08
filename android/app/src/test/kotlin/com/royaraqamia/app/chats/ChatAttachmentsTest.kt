package com.royaraqamia.app.chats

import com.royaraqamia.app.contracts.generated.ChatThreadResponseThreadAttachmentQuota
import com.royaraqamia.app.contracts.generated.ChatThreadResponseThreadAttachmentQuotaProject
import com.royaraqamia.app.contracts.generated.ChatThreadResponseThreadAttachmentQuotaToday
import com.royaraqamia.app.contracts.generated.ChatThreadResponseThreadAttachmentQuotaTotal
import java.io.ByteArrayInputStream
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * The composer's allowance arithmetic (#933), as the site's `attachment-quota.ts`
 * computes it: every check before an upload, and the same five refusals.
 */
class ChatAttachmentsTest {
    private fun file(name: String, type: String = "image/webp", bytes: Long = 1_024) =
        ChatComposeFile(
            fileName = name,
            mimeType = type,
            byteSize = bytes,
            open = { ByteArrayInputStream(ByteArray(bytes.toInt())) },
        )

    private fun quota(
        fileBytes: Long = 10L * 1024 * 1024,
        todayUsed: Long = 0,
        todayLimit: Long = 100L * 1024 * 1024,
        totalUsed: Long = 0,
        totalLimit: Long = 200L * 1024 * 1024,
        projectUsed: Long = 0,
        projectLimit: Long = 500L * 1024 * 1024,
    ) = ChatThreadResponseThreadAttachmentQuota(
        fileBytes = fileBytes.toDouble(),
        today =
            ChatThreadResponseThreadAttachmentQuotaToday(
                usedBytes = todayUsed.toDouble(),
                limitBytes = todayLimit.toDouble(),
            ),
        total =
            ChatThreadResponseThreadAttachmentQuotaTotal(
                usedBytes = totalUsed.toDouble(),
                limitBytes = totalLimit.toDouble(),
            ),
        project =
            ChatThreadResponseThreadAttachmentQuotaProject(
                usedBytes = projectUsed.toDouble(),
                limitBytes = projectLimit.toDouble(),
            ),
    )

    @Test
    fun `a pick inside every ceiling is staged`() {
        val staged = ChatAttachments.stage(emptyList(), listOf(file("a"), file("b", "text/plain")), quota())
        assertTrue(staged is ChatAttachmentStage.Staged)
        assertEquals(2, (staged as ChatAttachmentStage.Staged).files.size)
    }

    @Test
    fun `a file above the per-file ceiling reads the site's sentence`() {
        val pick = file("huge.webp", bytes = 11L * 1024 * 1024)
        val refused = ChatAttachments.stage(emptyList(), listOf(pick), quota())
        assertEquals(
            ChatAttachmentStage.Refused(
                ChatAttachmentsCopy.TOO_LARGE.replace("{size}", ChatAttachments.formatSize(10L * 1024 * 1024))
            ),
            refused,
        )
    }

    @Test
    fun `the sixth attachment is refused with the five-per-message sentence`() {
        val current = (1..5).map { file("f$it") }
        val refused = ChatAttachments.stage(current, listOf(file("six")), quota())
        assertEquals(ChatAttachmentStage.Refused(ChatAttachmentsCopy.TOO_MANY), refused)
    }

    @Test
    fun `the three spent allowances refuse in the site's order`() {
        val pick = listOf(file("a", bytes = 2L * 1024 * 1024))
        assertEquals(
            ChatAttachmentStage.Refused(ChatAttachmentsCopy.TODAY),
            ChatAttachments.stage(emptyList(), pick, quota(todayUsed = 99L * 1024 * 1024)),
        )
        assertEquals(
            ChatAttachmentStage.Refused(ChatAttachmentsCopy.TOTAL),
            ChatAttachments.stage(
                emptyList(),
                pick,
                quota(todayUsed = 0, totalUsed = 199L * 1024 * 1024),
            ),
        )
        assertEquals(
            ChatAttachmentStage.Refused(ChatAttachmentsCopy.PROJECT),
            ChatAttachments.stage(
                emptyList(),
                pick,
                quota(totalUsed = 0, projectUsed = 499L * 1024 * 1024),
            ),
        )
    }

    @Test
    fun `an object name is flat and the type defaults like the site`() {
        assertEquals("a-b-c.pdf", ChatAttachments.objectName("a/b\\c.pdf"))
        assertEquals("file", ChatAttachments.objectName("   "))
        assertEquals("application/octet-stream", ChatAttachments.mimeOf(""))
    }

    @Test
    fun `a known size reads with ASCII digits`() {
        assertEquals("0 ك.ب", ChatAttachments.formatSize(0))
        assertEquals("1 ك.ب", ChatAttachments.formatSize(1024))
        assertEquals("1.5 م.ب", ChatAttachments.formatSize((1.5 * 1024 * 1024).toLong()))
        assertEquals("10 م.ب", ChatAttachments.formatSize(10L * 1024 * 1024))
    }
}
