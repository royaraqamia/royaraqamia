package com.royaraqamia.app.community

import com.royaraqamia.app.contracts.generated.CommunityIndexResponsePostsItem
import com.royaraqamia.app.contracts.generated.CommunityIndexResponsePostsItemStatus
import com.royaraqamia.app.store.blogpress.BlogpressEditorFields
import com.royaraqamia.app.store.blogpress.BlogpressEditorStore
import com.royaraqamia.app.store.blogpress.BlogpressPostRow
import com.royaraqamia.app.store.outbox.DrainReport

/**
 * The community editor over BlogPress's Local Store (#925).
 *
 * A community post *is* a BlogPress post, so this is an adapter rather than a
 * second store: the row, the `post.save` intent and the queue are the ones the
 * BlogPress editor already writes, and the server route (`PATCH
 * /api/community/posts/{id}`) is the one the page's own composer calls. The
 * adapter's whole job is the community editor's narrower field set — the body,
 * and the description the site derives from it — plus seeding the store from the
 * feed's copy so a post can be edited with the radio off.
 */
class CommunityEditorRepository(private val store: BlogpressEditorStore) : CommunityEditorStore {
    override suspend fun open(post: CommunityIndexResponsePostsItem): CommunityEditorDraft? {
        val row = store.editorPost(post.id) ?: store.rememberPost(post.toEditorRow()) ?: return null
        return CommunityEditorDraft(row.id, row.content)
    }

    override suspend fun save(id: String, body: String): CommunityEditorDraft? {
        val row = store.editorPost(id) ?: return null
        if (body == row.content) return CommunityEditorDraft(row.id, row.content)
        val saved =
            store.saveDraft(
                id,
                BlogpressEditorFields(
                    slug = row.slug,
                    content = body,
                    coverImage = row.coverImage,
                    metaTitle = row.metaTitle,
                    // What the site's composer sends as the description: the
                    // Markdown stripped and cut to the feed's preview length.
                    metaDesc =
                        PostText.stripMarkdown(body).take(
                            CommunityLimits.DESCRIPTION_PREVIEW
                        ),
                ),
            ) ?: return null
        return CommunityEditorDraft(saved.id, saved.content)
    }

    override suspend fun outboxStatus(): DrainReport = store.outboxStatus()

    override suspend fun drain(): DrainReport = store.drain()
}

/**
 * The feed's row as the store holds it.
 *
 * The feed's projection carries every column the store needs, so seeding is a
 * naming exercise rather than a fetch. `clientId` falls back to the server id,
 * the same identity the sync merge uses for a row that arrived without one.
 */
fun CommunityIndexResponsePostsItem.toEditorRow(): BlogpressPostRow =
    BlogpressPostRow(
        clientId = client_id ?: id,
        id = id,
        slug = slug,
        content = content.orEmpty(),
        status =
            when (status) {
                CommunityIndexResponsePostsItemStatus.DRAFT -> "draft"
                CommunityIndexResponsePostsItemStatus.PUBLISHED -> "published"
                CommunityIndexResponsePostsItemStatus.SCHEDULED -> "scheduled"
            },
        coverImage = cover_image.orEmpty(),
        metaTitle = meta_title.orEmpty(),
        metaDesc = meta_desc.orEmpty(),
        publishAt = publish_at,
        publishedAt = published_at,
        viewCount = view_count,
        featured = featured,
        communityVisible = community_visible,
        readingTimeMinutes = reading_time_minutes,
        createdAt = created_at,
        updatedAt = updated_at,
        deletedAt = deleted_at,
    )
