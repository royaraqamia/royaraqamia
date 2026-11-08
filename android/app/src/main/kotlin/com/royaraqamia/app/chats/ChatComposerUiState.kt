package com.royaraqamia.app.chats

/**
 * The composer's two attachment faces (#933).
 *
 * `Empty` draws only the paperclip; `Staged` draws the files the member chose and
 * the close button each chip reads. They mirror the two rows the site's
 * `chat-composer.tsx` draws above its input, and the words come from
 * [ChatComposeAttachmentsCopy].
 */
sealed interface ChatComposerUiState {
    /** Nothing staged: the paperclip is the only attachment control. */
    data object Empty : ChatComposerUiState

    /** Files staged: their chips and their removal labels are drawn. */
    data object Staged : ChatComposerUiState
}
