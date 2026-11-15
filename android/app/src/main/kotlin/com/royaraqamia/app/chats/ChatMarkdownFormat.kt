package com.royaraqamia.app.chats

import androidx.compose.ui.text.TextRange
import androidx.compose.ui.text.input.TextFieldValue

/**
 * The marks a message can carry, in the text the site stores (ADR-0193).
 *
 * The app writes the same operators the site writes — the field on the site
 * serialises its editor to exactly these — so a message formatted on a phone
 * opens formatted in the browser and the other way round. Nothing here knows
 * about rendering: `CommunityMarkdown.inline` draws the result.
 */
enum class ChatMark(val token: String) {
    Bold("**"),
    Italic("_"),
    Underline("__"),
    Strike("~~"),
    Code("`"),
}

/**
 * Wraps the selection in [mark], or unwraps it when the same mark already
 * surrounds it. With nothing selected the two markers are inserted and the caret
 * lands between them, which is what a member expects from pressing "bold" on an
 * empty cursor.
 *
 * Pure on purpose: the composer's selection handling is the part that cannot be
 * tested without a device, and it should not also carry the rules.
 */
fun toggleChatMark(value: TextFieldValue, mark: ChatMark): TextFieldValue {
    val token = mark.token
    val text = value.text
    val start = value.selection.min
    val end = value.selection.max

    if (start == end) {
        val inserted = text.substring(0, start) + token + token + text.substring(start)
        return TextFieldValue(inserted, TextRange(start + token.length))
    }

    val selected = text.substring(start, end)
    val outsideStart = start - token.length
    val outsideEnd = end + token.length

    // Already marked on the outside: drop the two markers.
    if (
        outsideStart >= 0 &&
            outsideEnd <= text.length &&
            text.substring(outsideStart, start) == token &&
            text.substring(end, outsideEnd) == token
    ) {
        val unwrapped = text.substring(0, outsideStart) + selected + text.substring(outsideEnd)
        return TextFieldValue(unwrapped, TextRange(outsideStart, outsideStart + selected.length))
    }

    // Already marked inside the selection: drop the markers from the selection.
    if (selected.length >= token.length * 2 && selected.startsWith(token) && selected.endsWith(token)) {
        val inner = selected.substring(token.length, selected.length - token.length)
        val unwrapped = text.substring(0, start) + inner + text.substring(end)
        return TextFieldValue(unwrapped, TextRange(start, start + inner.length))
    }

    val wrapped = text.substring(0, start) + token + selected + token + text.substring(end)
    return TextFieldValue(wrapped, TextRange(start + token.length, end + token.length))
}

/**
 * The two markers of a link, with the caret put on the address: the writer has
 * already written the words, and the only thing left to type is where they go.
 */
fun insertChatLink(value: TextFieldValue): TextFieldValue {
    val text = value.text
    val start = value.selection.min
    val end = value.selection.max
    val label = text.substring(start, end)
    val placeholder = "https://"

    val inserted =
        text.substring(0, start) + "[" + label + "](" + placeholder + ")" + text.substring(end)
    val addressStart = start + label.length + 3
    return TextFieldValue(inserted, TextRange(addressStart, addressStart + placeholder.length))
}
