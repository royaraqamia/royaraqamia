package com.royaraqamia.app.community

import com.royaraqamia.app.contracts.generated.CommunityIndexResponsePostsItem
import com.royaraqamia.app.store.outbox.DrainReport

/**
 * What the community editor asks the device store, and nothing else (#925).
 *
 * The post is a BlogPress row, so the editor is a second surface over the same
 * Local Store the BlogPress editor reads rather than a store of its own. The
 * interface is four verbs deep: open the row (seeding it from the feed when the
 * device has never seen it), commit one draft with its replay intent, read what
 * the queue owes, and drain it. Room, HTTP, the Outbox and the identity a
 * database is opened under stay behind it, which is what lets a JVM test drive
 * the whole draft story without a network.
 */
interface CommunityEditorStore {
    /**
     * The row the feed opened, pre-filled. A row on the device wins over the
     * feed's copy, so a draft typed before the process died is what comes back.
     * `null` when the row could neither be read nor remembered.
     */
    suspend fun open(post: CommunityIndexResponsePostsItem): CommunityEditorDraft?

    /**
     * Commits [body] and its `post.save` intent in one transaction, so the text
     * survives the process before any request is attempted. An unchanged body
     * commits nothing. `null` when the row is not on the device.
     */
    suspend fun save(id: String, body: String): CommunityEditorDraft?

    /** Pending and failed writes as the editor's status reports them. */
    suspend fun outboxStatus(): DrainReport

    /** Sends what the queue holds; the caller decides when. */
    suspend fun drain(): DrainReport
}

/** The two things the editor paints from a stored row. */
data class CommunityEditorDraft(val id: String, val body: String)
