package com.royaraqamia.app.community

import com.royaraqamia.app.api.ApiClient
import com.royaraqamia.app.contracts.ApiResult
import com.royaraqamia.app.contracts.generated.CommunityPostCreateResponse
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

/**
 * The community composer's one write (#924).
 *
 * A community post *is* a BlogPress post, so this calls the same route the
 * page's composer calls (`POST /api/community/posts`) with the fields the page
 * sends: the client-minted slug, the Markdown body, the description the site
 * derives from it, and `status: 'published'` so the server creates and publishes
 * in one transaction (#527) rather than leaving a draft behind.
 *
 * **A retry cannot duplicate a post that already landed.** The slug is minted
 * once per composer and the database keeps it unique (`posts_slug_key`). If the
 * first answer never arrived, the second write is refused by that constraint;
 * reading the slug back through the page's own public route says whether the row
 * is there, and a row that is there is the success the lost answer failed to
 * report. A refusal that is not a duplicate — a plan cap, an invalid body — reads
 * back as not-found and stays a failure, so the draft is kept and the sentence
 * is the server's.
 */
class CommunityComposerRepository(
    private val client: ApiClient,
    private val posts: CommunityPostRepository,
) : CommunityComposerStore {
    override suspend fun publish(slug: String, body: String): CommunityComposerResult {
        val text = body.trim()
        val payload =
            buildJsonObject {
                put("slug", slug)
                put("content", text)
                put("cover_image", "")
                put("meta_title", "")
                put(
                    "meta_desc",
                    PostText.stripMarkdown(text).take(CommunityLimits.DESCRIPTION_PREVIEW),
                )
                put("status", "published")
            }.toString()

        return when (val answer = client.post<CommunityPostCreateResponse>(POSTS_PATH, payload)) {
            is ApiResult.Success ->
                CommunityComposerResult.Published(answer.value.slug.ifEmpty { slug })
            is ApiResult.Failure ->
                when (val landed = posts.post(slug)) {
                    is CommunityPostResult.Live ->
                        CommunityComposerResult.Published(landed.post.post.slug)
                    else -> CommunityComposerResult.Failed(answer.error)
                }
        }
    }

    companion object {
        /** The route the page's composer posts to (#527). */
        const val POSTS_PATH = "/api/community/posts"
    }
}
