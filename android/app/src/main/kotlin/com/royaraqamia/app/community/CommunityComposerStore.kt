package com.royaraqamia.app.community

import com.royaraqamia.app.contracts.ApiError

/**
 * What the community composer asks the server, and nothing else (#924).
 *
 * The composer is the one public write (#658): it creates a published community
 * post through the same `POST /api/community/posts` the page's own composer
 * calls, with `status: 'published'` so the row takes a published slot rather than
 * a draft one. HTTP, the bearer and the retry decision stay behind this seam,
 * which is what lets a JVM test drive the whole publish story with a recording
 * transport.
 */
interface CommunityComposerStore {
    /**
     * Publishes [body] under [slug].
     *
     * [slug] is minted once by the composer and kept across retries: the
     * database's unique slug makes the second write of a post that already
     * landed a refusal, and the read-back behind this seam turns that refusal
     * into the success it is instead of a duplicate post.
     */
    suspend fun publish(slug: String, body: String): CommunityComposerResult
}

/** What one publish came to. */
sealed interface CommunityComposerResult {
    /** The server holds the post under this slug. */
    data class Published(val slug: String) : CommunityComposerResult

    /** The write did not land; the draft is still in the composer's field. */
    data class Failed(val error: ApiError) : CommunityComposerResult
}
