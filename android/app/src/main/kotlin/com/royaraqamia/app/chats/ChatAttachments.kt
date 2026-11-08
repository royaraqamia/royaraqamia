package com.royaraqamia.app.chats

import com.royaraqamia.app.contracts.generated.ChatThreadResponseThreadAttachmentQuota
import java.io.InputStream
import java.util.Locale

/**
 * A file the picker chose, before a byte of it is sent (#933).
 *
 * [open] hands the bytes to the storage upload when the member sends; nothing is
 * read at pick time, so a refused file costs nothing. The metadata is what the
 * message row carries beside the object.
 */
data class ChatComposeFile(
    val fileName: String,
    val mimeType: String,
    val byteSize: Long,
    val open: () -> InputStream,
)

/** What a pick did to the staged list: the files to keep, or the sentence why not. */
sealed interface ChatAttachmentStage {
    data class Staged(val files: List<ChatComposeFile>) : ChatAttachmentStage

    data class Refused(val sentence: String) : ChatAttachmentStage
}

/**
 * The composer's attachment arithmetic, in the site's order (#933).
 *
 * It is the app's half of `frontend/ui/chats/attachment-quota.ts`: every check
 * happens before the upload, so a refused file never spends a byte of the
 * allowance, and the refusal is one of the five faces in
 * [ChatAttachmentQuotaUiState]. The numbers are the route's
 * (`ChatThreadResponseThreadAttachmentQuota`) rather than constants here, because
 * the server owns the plan's allowances.
 */
object ChatAttachments {
    /** The contract's absolute per-file ceiling (`CHAT_ATTACHMENT_MAX_BYTES`). */
    const val MAX_BYTES = 25L * 1024 * 1024

    /** `CHAT_ATTACHMENTS_PER_MESSAGE_MAX`: one message carries five. */
    const val PER_MESSAGE_MAX = 5

    /** The bucket the site writes to; the object path is the site's too. */
    const val BUCKET = "chat-attachments"

    /** Whether one file is above the ceiling the server reports. */
    fun isTooLarge(byteSize: Long, limitBytes: Long = MAX_BYTES): Boolean = byteSize > limitBytes

    /** A flat object name: a separator would add a folder the bucket's path guard refuses. */
    fun objectName(fileName: String): String {
        val flat =
            fileName
                .replace(Regex("[\\\\/]"), "-")
                .filter { it.code >= 32 }
                .trim()
        return (flat.ifEmpty { "file" }).take(200)
    }

    /** What a storage object claims to be when the provider named no type. */
    fun mimeOf(mimeType: String): String =
        mimeType.trim().ifEmpty { "application/octet-stream" }

    /**
     * The refusal a pick earns, or null when every allowance holds.
     *
     * The order is the site's: the per-file ceiling, the five-per-message bound,
     * then today, the caller's own storage and the project's.
     */
    fun refusalOf(
        current: List<ChatComposeFile>,
        picked: List<ChatComposeFile>,
        quota: ChatThreadResponseThreadAttachmentQuota,
    ): ChatAttachmentQuotaUiState? {
        if (picked.isEmpty()) return null

        if (picked.any { isTooLarge(it.byteSize, quota.fileBytes.toLong()) }) {
            return ChatAttachmentQuotaUiState.TooLarge
        }
        if (current.size + picked.size > PER_MESSAGE_MAX) {
            return ChatAttachmentQuotaUiState.TooMany
        }

        val bytes = (current + picked).sumOf { it.byteSize }
        if (quota.today.usedBytes + bytes > quota.today.limitBytes) {
            return ChatAttachmentQuotaUiState.Today
        }
        if (quota.total.usedBytes + bytes > quota.total.limitBytes) {
            return ChatAttachmentQuotaUiState.Total
        }
        if (quota.project.usedBytes + bytes > quota.project.limitBytes) {
            return ChatAttachmentQuotaUiState.Project
        }
        return null
    }

    /** What a pick does to the staged list. */
    fun stage(
        current: List<ChatComposeFile>,
        picked: List<ChatComposeFile>,
        quota: ChatThreadResponseThreadAttachmentQuota,
    ): ChatAttachmentStage {
        val refusal = refusalOf(current, picked, quota)
        if (refusal != null) return ChatAttachmentStage.Refused(sentenceOf(refusal, quota.fileBytes.toLong()))
        return ChatAttachmentStage.Staged(current + picked)
    }

    /** The sentence a refusal face reads, from the copy the site also draws. */
    fun sentenceOf(state: ChatAttachmentQuotaUiState, fileBytes: Long = 0): String =
        when (state) {
            ChatAttachmentQuotaUiState.TooLarge ->
                ChatAttachmentsCopy.TOO_LARGE.replace("{size}", formatSize(fileBytes))
            ChatAttachmentQuotaUiState.TooMany -> ChatAttachmentsCopy.TOO_MANY
            ChatAttachmentQuotaUiState.Today -> ChatAttachmentsCopy.TODAY
            ChatAttachmentQuotaUiState.Total -> ChatAttachmentsCopy.TOTAL
            ChatAttachmentQuotaUiState.Project -> ChatAttachmentsCopy.PROJECT
        }

    /**
     * A known size, the site's `formatAttachmentSize`: `0 ك.ب`, whole kilobytes,
     * one decimal of a megabyte under ten, and whole megabytes above. ASCII
     * digits, per the repository's rule.
     */
    fun formatSize(bytes: Long): String {
        if (bytes <= 0) return "0 ك.ب"
        val mb = bytes.toDouble() / (1024 * 1024)
        if (mb >= 1) {
            val value =
                if (mb >= 10) Math.round(mb).toString()
                else String.format(Locale.US, "%.1f", mb)
            return "$value م.ب"
        }
        return "${maxOf(1L, Math.round(bytes / 1024.0))} ك.ب"
    }
}
