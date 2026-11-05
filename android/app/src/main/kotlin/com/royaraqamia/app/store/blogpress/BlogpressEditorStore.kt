package com.royaraqamia.app.store.blogpress

import com.royaraqamia.app.contracts.ApiResult
import com.royaraqamia.app.store.outbox.DrainReport

/**
 * What the editor asks the store, and nothing else (#954).
 *
 * The screen is a second client of the same device rows the posts list reads, but
 * it needs four verbs rather than the whole repository: open one row, commit one
 * autosave with its replay intent, read what the queue owes, and drain it. A
 * small interface here keeps the editor testable with a fake and keeps Room, HTTP
 * and the outbox out of the composition.
 */
interface BlogpressEditorStore {
    /** The row the route opened, by server id or client id. `null` when absent. */
    suspend fun editorPost(id: String): BlogpressPostRow?

    /**
     * Commits the editor's fields and their `post.save` intent in one transaction,
     * so the draft survives the process before any request is attempted.
     */
    suspend fun saveDraft(id: String, fields: BlogpressEditorFields): BlogpressPostRow?

    /** Pending and failed writes as the editor's status reports them. */
    suspend fun outboxStatus(): DrainReport

    /** Sends what the queue holds; the caller decides when. */
    suspend fun drain(): DrainReport

    /** The page's publish transition, which is online-only (ADR-0031). */
    suspend fun publishPost(id: String): ApiResult<String>
}

/** The five fields the editor owns (the rest of the row is server-owned). */
data class BlogpressEditorFields(
    val slug: String,
    val content: String,
    val coverImage: String,
    val metaTitle: String,
    val metaDesc: String,
)
