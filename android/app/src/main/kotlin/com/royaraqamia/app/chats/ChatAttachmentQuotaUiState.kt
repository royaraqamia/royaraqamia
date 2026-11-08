package com.royaraqamia.app.chats

/**
 * The five ways a pick is refused before an upload starts (#933).
 *
 * They are the site's `ATTACHMENT_REFUSALS` boundaries (`attachment-quota.ts`),
 * and each one names the allowance it spent: the per-file ceiling, the five per
 * message, and the three walls — today, the caller's own storage and the whole
 * project's. The sentences come from [ChatAttachmentsCopy], generated from the
 * same source the site reads, so the refusal cannot be worded two ways.
 */
sealed interface ChatAttachmentQuotaUiState {
    /** The file is larger than the per-file ceiling the server reports. */
    data object TooLarge : ChatAttachmentQuotaUiState

    /** The message already carries five attachments. */
    data object TooMany : ChatAttachmentQuotaUiState

    /** The member's day allowance is spent. */
    data object Today : ChatAttachmentQuotaUiState

    /** The member's own storage is full. */
    data object Total : ChatAttachmentQuotaUiState

    /** The project's shared storage is full. */
    data object Project : ChatAttachmentQuotaUiState
}
