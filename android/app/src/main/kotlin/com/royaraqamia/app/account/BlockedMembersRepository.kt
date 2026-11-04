package com.royaraqamia.app.account

import com.royaraqamia.app.api.ApiClient
import com.royaraqamia.app.contracts.ApiError
import com.royaraqamia.app.contracts.ApiResult
import com.royaraqamia.app.contracts.generated.ChatBlockedMembersResponse
import com.royaraqamia.app.contracts.generated.ChatOkResponse

/** One member the account has blocked, as the page lists them. */
data class BlockedMember(
    val id: String,
    val username: String,
    val name: String?,
    val avatarUrl: String?,
)

/**
 * The account's blocked members (#977): the same two routes the page calls,
 * `GET /api/chats/blocks` and `DELETE /api/chats/blocks/{id}`.
 *
 * The list is read from the server rather than assembled locally, because the
 * server is the record of who is still blocked: an unblock that half-succeeded
 * must not look complete because the client removed the row optimistically. The
 * page filters its row on a successful answer, so this repository does the same
 * only after the server has said yes.
 */
class BlockedMembersRepository(private val client: ApiClient) {
    suspend fun list(): ApiResult<List<BlockedMember>> =
        when (val result = client.get<ChatBlockedMembersResponse>(LIST_PATH)) {
            is ApiResult.Success -> {
                val body = result.value
                if (!body.success) {
                    ApiResult.Failure(ApiError.Server(200, body.error.orEmpty()))
                } else {
                    ApiResult.Success(
                        body.blocked.orEmpty().map { member ->
                            BlockedMember(
                                id = member.id,
                                username = member.username,
                                name = member.name,
                                avatarUrl = member.avatarUrl,
                            )
                        }
                    )
                }
            }
            is ApiResult.Failure -> result
        }

    /** Lifts one block; the row disappears from both clients on a success. */
    suspend fun unblock(userId: String): ApiResult<Unit> =
        when (val result = client.delete<ChatOkResponse>(blocksPath(userId))) {
            is ApiResult.Success ->
                if (result.value.success) {
                    ApiResult.Success(Unit)
                } else {
                    ApiResult.Failure(ApiError.Server(200, result.value.error.orEmpty()))
                }
            is ApiResult.Failure -> result
        }

    companion object {
        const val LIST_PATH = "/api/chats/blocks"

        fun blocksPath(userId: String): String = "$LIST_PATH/$userId"
    }
}
