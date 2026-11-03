package com.royaraqamia.app.chats

import com.royaraqamia.app.api.ApiClient
import com.royaraqamia.app.contracts.ApiError
import com.royaraqamia.app.contracts.ApiResult
import com.royaraqamia.app.contracts.generated.ChatAssistantStateResponse
import com.royaraqamia.app.contracts.generated.ChatAttachmentUrlResponse
import com.royaraqamia.app.contracts.generated.ChatMembersResponse
import com.royaraqamia.app.contracts.generated.ChatMembersResponseMembersItem
import com.royaraqamia.app.contracts.generated.ChatMessagePageResponse
import com.royaraqamia.app.contracts.generated.ChatMessagePageResponseMessagesItem
import com.royaraqamia.app.contracts.generated.ChatMessageResponse
import com.royaraqamia.app.contracts.generated.ChatOkResponse
import com.royaraqamia.app.contracts.generated.ChatStartResponse
import com.royaraqamia.app.contracts.generated.ChatThreadResponse
import com.royaraqamia.app.contracts.generated.ChatThreadResponseThread
import com.royaraqamia.app.contracts.generated.ChatThreadsResponse
import com.royaraqamia.app.contracts.generated.ChatThreadsResponseThreadsItem
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import java.net.URLEncoder

/** One page of a thread's lines, and the cursor before them. */
data class ChatMessages(
    val messages: List<ChatMessagePageResponseMessagesItem>,
    val nextCursor: String?,
)

/**
 * The chats surface's reads and writes (#819).
 *
 * Every route here is one the site's own components call, with the same body and
 * the same order: the list the tab draws (`GET /api/chats`), one thread
 * (`GET /api/chats/[id]`), a page of its lines (`GET /api/chats/[id]/messages`),
 * and the writes those two screens make. A port that read a narrower route would
 * be a second component with the same name (ADR-0103), so the routes are the
 * site's and the bodies are the generated ones.
 *
 * A refusal is a value: a policy answer arrives as `success: false` with the
 * member's own sentence, and [ChatFailure.sentenceOf] is what turns it into text
 * a screen can draw — never a thrown error, because "you cannot post here" is a
 * state rather than an outage (ADR-0031).
 */
class ChatsRepository(private val client: ApiClient) {
    /** The tab's rows, from the route the site's tab reads. */
    suspend fun threads(): ApiResult<List<ChatThreadsResponseThreadsItem>> =
        when (val result = client.get<ChatThreadsResponse>(THREADS_PATH)) {
            is ApiResult.Success -> {
                val body = result.value
                if (!body.success) {
                    refused(body.error)
                } else {
                    ApiResult.Success(body.threads.orEmpty())
                }
            }
            is ApiResult.Failure -> result
        }

    /** One thread's header, roster and rights. */
    suspend fun thread(conversationId: String): ApiResult<ChatThreadResponseThread> =
        when (val result = client.get<ChatThreadResponse>(threadPath(conversationId))) {
            is ApiResult.Success -> {
                val body = result.value
                val thread = body.thread
                if (!body.success || thread == null) {
                    refused(body.error)
                } else {
                    ApiResult.Success(thread)
                }
            }
            is ApiResult.Failure -> result
        }

    /** A page of lines, oldest last; `before` is the opaque cursor a page answered. */
    suspend fun messages(
        conversationId: String,
        before: String? = null,
    ): ApiResult<ChatMessages> {
        val query = if (before == null) "" else "?before=" + encode(before)
        return when (
            val result = client.get<ChatMessagePageResponse>(messagesPath(conversationId) + query)
        ) {
            is ApiResult.Success ->
                if (result.value.success) {
                    ApiResult.Success(
                        ChatMessages(
                            messages = result.value.messages.orEmpty(),
                            nextCursor = result.value.nextCursor,
                        )
                    )
                } else {
                    refused(result.value.error)
                }
            is ApiResult.Failure -> result
        }
    }

    /**
     * One line, written. The answer's own row is not returned to the screen: the
     * thread is read again, which is what the site's hook does after a send and
     * what keeps one page shape rather than two structurally identical ones.
     */
    suspend fun send(conversationId: String, body: String): ApiResult<Unit> =
        when (val result = client.post<ChatMessageResponse>(messagesPath(conversationId), textOf(body))) {
            is ApiResult.Success ->
                if (!result.value.success || result.value.message == null) {
                    refused(result.value.error)
                } else {
                    ApiResult.Success(Unit)
                }
            is ApiResult.Failure -> result
        }

    /** The same message, rewritten inside the window the RLS policy allows. */
    suspend fun edit(messageId: String, body: String): ApiResult<Unit> =
        when (val result = client.patch<ChatMessageResponse>(messagePath(messageId), textOf(body))) {
            is ApiResult.Success ->
                if (!result.value.success || result.value.message == null) {
                    refused(result.value.error)
                } else {
                    ApiResult.Success(Unit)
                }
            is ApiResult.Failure -> result
        }

    /** A tombstone: the row stays, its words do not. */
    suspend fun delete(messageId: String): ApiResult<Unit> =
        ok(client.delete<ChatOkResponse>(messagePath(messageId)))

    /** Accept or refuse a request: the answer the list's two buttons send. */
    suspend fun respond(conversationId: String, accept: Boolean): ApiResult<Unit> =
        ok(
            client.post<ChatOkResponse>(
                respondPath(conversationId),
                buildJsonObject { put("answer", if (accept) "accept" else "decline") }.toString(),
            )
        )

    /**
     * The read watermark. The body is empty, so the server stamps "now" — the same
     * request the site's hook sends on open and on a new line (#816).
     */
    suspend fun markRead(conversationId: String): ApiResult<Unit> =
        ok(client.post<ChatOkResponse>(readPath(conversationId), "{}"))

    /** Ask again on a closed thread. */
    suspend fun request(conversationId: String): ApiResult<Unit> =
        ok(client.post<ChatOkResponse>(requestPath(conversationId), null))

    /** Take a pending request back. */
    suspend fun withdraw(conversationId: String): ApiResult<Unit> =
        ok(client.post<ChatOkResponse>(withdrawPath(conversationId), null))

    /** Leave a group. */
    suspend fun leave(conversationId: String): ApiResult<Unit> =
        ok(client.post<ChatOkResponse>(leavePath(conversationId), null))

    /** Block the counterpart; the thread says so until it is lifted. */
    suspend fun block(userId: String): ApiResult<Unit> =
        ok(
            client.post<ChatOkResponse>(
                BLOCKS_PATH,
                buildJsonObject { put("userId", userId) }.toString(),
            )
        )

    /** Lift the block. */
    suspend fun unblock(userId: String): ApiResult<Unit> =
        ok(client.delete<ChatOkResponse>(blocksPath(userId)))

    /** Invite members into a group; every invite waits for its own answer. */
    suspend fun invite(conversationId: String, memberIds: List<String>): ApiResult<Unit> =
        ok(
            client.post<ChatOkResponse>(
                participantsPath(conversationId),
                buildJsonObject {
                        put(
                            "memberIds",
                            buildJsonArray { memberIds.forEach { add(JsonPrimitive(it)) } },
                        )
                    }
                    .toString(),
            )
        )

    /** The member directory the invite panel searches. */
    suspend fun members(query: String): ApiResult<List<ChatMembersResponseMembersItem>> =
        when (
            val result = client.get<ChatMembersResponse>(MEMBERS_PATH + "?q=" + encode(query.trim()))
        ) {
            is ApiResult.Success ->
                if (result.value.success) {
                    ApiResult.Success(result.value.members.orEmpty())
                } else {
                    refused(result.value.error)
                }
            is ApiResult.Failure -> result
        }

    /**
     * Opening the assistant: idempotent on the server, which answers the one
     * thread this member has rather than creating a second (#817).
     */
    suspend fun startAssistant(): ApiResult<ChatStartResponse> =
        when (val result = client.post<ChatStartResponse>(ASSISTANT_PATH, null)) {
            is ApiResult.Success ->
                if (result.value.success && result.value.conversationId != null) {
                    result
                } else {
                    refused(result.value.error)
                }
            is ApiResult.Failure -> result
        }

    /** Whether the assistant is configured, and what a turn costs. */
    suspend fun assistant(): ApiResult<ChatAssistantStateResponse> =
        when (val result = client.get<ChatAssistantStateResponse>(ASSISTANT_PATH)) {
            is ApiResult.Success ->
                if (result.value.success) result else refused(result.value.error)
            is ApiResult.Failure -> result
        }

    /** One attachment's minute-long signed URL: the app hands it to the browser. */
    suspend fun attachmentUrl(
        conversationId: String,
        attachmentId: String,
    ): ApiResult<ChatAttachmentUrlResponse> =
        when (
            val result =
                client.get<ChatAttachmentUrlResponse>(attachmentPath(conversationId, attachmentId))
        ) {
            is ApiResult.Success -> {
                val url = result.value.url
                if (!result.value.success || url == null) {
                    refused(result.value.error)
                } else {
                    result
                }
            }
            is ApiResult.Failure -> result
        }

    /** A write with no body to draw: only its refusal has words. */
    private fun ok(result: ApiResult<ChatOkResponse>): ApiResult<Unit> =
        when (result) {
            is ApiResult.Success ->
                if (result.value.success) ApiResult.Success(Unit) else refused(result.value.error)
            is ApiResult.Failure -> result
        }

    /** The server's sentence, or nothing: the screen's own copy fills an empty one. */
    private fun <T> refused(sentence: String?): ApiResult<T> =
        ApiResult.Failure(ApiError.Server(200, sentence.orEmpty()))

    private fun textOf(body: String): String = buildJsonObject { put("body", body) }.toString()

    private fun encode(value: String): String = URLEncoder.encode(value, "UTF-8")

    companion object {
        const val THREADS_PATH = "/api/chats"
        const val MEMBERS_PATH = "/api/chats/members"
        const val BLOCKS_PATH = "/api/chats/blocks"
        const val ASSISTANT_PATH = "/api/chats/assistant"

        fun threadPath(conversationId: String): String = "$THREADS_PATH/$conversationId"

        fun messagesPath(conversationId: String): String = "${threadPath(conversationId)}/messages"

        fun messagePath(messageId: String): String = "$THREADS_PATH/messages/$messageId"

        fun respondPath(conversationId: String): String = "${threadPath(conversationId)}/respond"

        fun readPath(conversationId: String): String = "${threadPath(conversationId)}/read"

        fun requestPath(conversationId: String): String = "${threadPath(conversationId)}/request"

        fun withdrawPath(conversationId: String): String = "${threadPath(conversationId)}/withdraw"

        fun leavePath(conversationId: String): String = "${threadPath(conversationId)}/leave"

        fun participantsPath(conversationId: String): String =
            "${threadPath(conversationId)}/participants"

        fun attachmentPath(conversationId: String, attachmentId: String): String =
            "${threadPath(conversationId)}/attachments/$attachmentId"

        fun blocksPath(userId: String): String = "$BLOCKS_PATH/$userId"
    }
}

/**
 * The sentence a refusal carries (#819).
 *
 * The transport hands a failed request the raw body (`ApiError.Server`), and a
 * chat's refusals are Arabic sentences inside it. The screen draws the server's
 * words rather than a generic line, because a policy that says "you cannot post
 * here" in its own sentence is the answer the member needs; when the body carries
 * none the screen's own copy is the fallback.
 */
object ChatFailure {
    fun sentenceOf(error: ApiError): String? =
        when (error) {
            is ApiError.Server -> sentenceIn(error.detail)
            is ApiError.Network,
            is ApiError.NotSignedIn,
            is ApiError.InvalidContract -> null
        }

    private fun sentenceIn(body: String): String? =
        runCatching {
                val parsed: JsonObject = Json.parseToJsonElement(body).jsonObject
                parsed["error"]?.jsonPrimitive?.content?.takeIf { it.isNotBlank() }
            }
            .getOrNull()
}
