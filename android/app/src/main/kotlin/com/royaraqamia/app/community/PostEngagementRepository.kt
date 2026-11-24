package com.royaraqamia.app.community

import com.royaraqamia.app.api.ApiClient
import com.royaraqamia.app.contracts.ApiResult
import com.royaraqamia.app.contracts.generated.CreateCommentResponse
import com.royaraqamia.app.contracts.generated.DeleteCommentResponse
import com.royaraqamia.app.contracts.generated.PostCommentsResponse
import com.royaraqamia.app.contracts.generated.PostEngagementBatch
import com.royaraqamia.app.contracts.generated.PostLikeResponse
import com.royaraqamia.app.contracts.generated.UpdateCommentResponse
import java.net.URLEncoder
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.add
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

/**
 * A post's likes and comments (#1573), on the routes the page uses.
 *
 * The numbers are public and the `liked` flag is the caller's own, so the batch
 * read is a public POST — the set of ids is the body, never a URL — and the
 * writes carry the bearer the client already holds. A feed page asks once for
 * all its cards rather than once per card; the answer carries a row for every id
 * it was handed, zeros included.
 */
class PostEngagementRepository(private val client: ApiClient) {
    suspend fun states(postIds: List<String>): ApiResult<PostEngagementBatch> {
        if (postIds.isEmpty()) {
            return ApiResult.Success(PostEngagementBatch(emptyList()))
        }

        val payload =
            buildJsonObject {
                put(
                    "postIds",
                    buildJsonArray { postIds.forEach { add(it) } },
                )
            }.toString()

        return client.postPublic(ENGAGEMENT_PATH, payload, PostEngagementBatch.serializer())
    }

    suspend fun like(slug: String, liked: Boolean): ApiResult<PostLikeResponse> {
        val payload = buildJsonObject { put("liked", liked) }.toString()
        return client.put(
            "${postPath(slug)}/like",
            payload,
            PostLikeResponse.serializer(),
        )
    }

    suspend fun comments(slug: String, cursor: String? = null): ApiResult<PostCommentsResponse> {
        val query = cursor?.let { "?cursor=${URLEncoder.encode(it, "UTF-8")}" }.orEmpty()
        return client.getPublic(
            "${postPath(slug)}/comments$query",
            PostCommentsResponse.serializer(),
        )
    }

    suspend fun comment(slug: String, body: String): ApiResult<CreateCommentResponse> {
        val payload = buildJsonObject { put("body", body) }.toString()
        return client.post(
            "${postPath(slug)}/comments",
            payload,
            CreateCommentResponse.serializer(),
        )
    }

    suspend fun edit(commentId: String, body: String): ApiResult<UpdateCommentResponse> {
        val payload = buildJsonObject { put("body", body) }.toString()
        return client.patch(
            "/api/community/comments/${URLEncoder.encode(commentId, "UTF-8")}",
            payload,
            UpdateCommentResponse.serializer(),
        )
    }

    suspend fun delete(commentId: String): ApiResult<DeleteCommentResponse> =
        client.delete(
            "/api/community/comments/${URLEncoder.encode(commentId, "UTF-8")}",
            DeleteCommentResponse.serializer(),
        )

    /** The report route's answer; the snapshot stays on the server. */
    @Serializable
    data class ReportAck(val success: Boolean = true, val id: String = "", val createdAt: String = "")

    suspend fun report(commentId: String, reason: String): ApiResult<ReportAck> {
        val payload = buildJsonObject { put("reason", reason) }.toString()
        return client.post(
            "/api/community/comments/${URLEncoder.encode(commentId, "UTF-8")}/report",
            payload,
            ReportAck.serializer(),
        )
    }

    companion object {
        const val ENGAGEMENT_PATH = "/api/community/engagement"

        fun postPath(slug: String): String =
            "/api/community/${URLEncoder.encode(slug, "UTF-8")}"
    }
}
