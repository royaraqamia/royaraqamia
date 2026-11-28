package com.royaraqamia.app.assistant

/**
 * The assistant's name in the app, until the app reads the member's own (ADR-0229).
 *
 * The site now draws the name the member chose; the copy it shares with the app
 * carries it as `{name}`, because a constant cannot hold a per-member value. The
 * app still has no identity read, so every call site substitutes the deployment's
 * default — the same `title` the panel already paints — and a sentence never
 * reaches a screen with `{name}` in it.
 *
 * When the identity reaches the app (the next slice), this object is the one
 * place that changes: `DEFAULT` becomes the member's name from the snapshot and
 * the call sites stay as they are.
 */
object AssistantName {
    val DEFAULT: String = AssistantPanelCopy.TITLE

    /** Fill a copy string's `{name}` with the name this client knows. */
    fun inText(template: String): String = template.replace("{name}", DEFAULT)
}
