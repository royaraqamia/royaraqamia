package com.royaraqamia.app.account

import com.royaraqamia.app.api.ApiClient
import com.royaraqamia.app.contracts.ApiResult
import com.royaraqamia.app.contracts.ContractCodec
import com.royaraqamia.app.contracts.generated.AvatarUploadResponse
import com.royaraqamia.app.contracts.generated.UpdateName
import com.royaraqamia.app.contracts.generated.UpdateNameResponse
import com.royaraqamia.app.net.MultipartFile

/** One image the member chose for their avatar, before a byte is sent (#945). */
data class AvatarUpload(
    val fileName: String,
    val mimeType: String,
    val bytes: ByteArray,
)

/**
 * The account profile's two writes and its avatar read (#945), on the routes the
 * page's own `ProfileEditor` uses.
 *
 * This is the seam the profile card (#946) draws through: the name is a
 * `PATCH /api/me/name` with a generated body, the avatar is a
 * `POST /api/me/avatar` with the one `file` part the route reads, and the
 * picture is the same public URL the page renders. Nothing here is a route of
 * its own — a second endpoint would be a second contract, and the app would show
 * less than the page (ADR-0098).
 *
 * It is also an [AvatarLoader], so the card can hand the same object to
 * [AccountAvatar] rather than the composition root growing a second seam.
 */
class AccountProfileRepository(
    private val client: ApiClient,
    private val avatars: AvatarLoader,
) : AvatarLoader {
    suspend fun updateName(name: String): ApiResult<UpdateNameResponse> =
        client.patch<UpdateNameResponse>(PATH_NAME, ContractCodec.encode(UpdateName(name)))

    suspend fun uploadAvatar(file: AvatarUpload): ApiResult<AvatarUploadResponse> =
        client.postFile<AvatarUploadResponse>(
            path = PATH_AVATAR,
            file = MultipartFile(AVATAR_FIELD, file.fileName, file.mimeType, file.bytes),
        )

    /** The avatar's bytes, or `null` when the picture cannot be read. */
    override suspend fun load(url: String): ByteArray? =
        url.trim().takeIf { it.isNotEmpty() }?.let { avatars.load(it) }

    companion object {
        const val PATH_NAME = "/api/me/name"
        const val PATH_AVATAR = "/api/me/avatar"

        /** The field the page's `FormData` and the route's `formData.get` both name. */
        const val AVATAR_FIELD = "file"
    }
}
