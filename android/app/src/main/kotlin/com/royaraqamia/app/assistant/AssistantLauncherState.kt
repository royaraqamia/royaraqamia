package com.royaraqamia.app.assistant

/**
 * Whether the corner's door is drawn (ADR-0143).
 *
 * It is `Hidden` on the two routes the site hides it on: the conversation's own
 * screen (`/chats...`) already is the door, and a sign-in flow is a page whose
 * whole job is to leave. The app's frame only draws native screens, so the
 * document's own FAB is never doubled by this one.
 */
sealed interface AssistantLauncherState {
    /** The orb and its label are on the frame. */
    data object Visible : AssistantLauncherState

    /** The route owns the corner itself. */
    data object Hidden : AssistantLauncherState
}
