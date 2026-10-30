package com.royaraqamia.app.session

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/**
 * The three bodies the app exchanges with GoTrue (#501): one answer, two questions.
 *
 * They are one file because they are one protocol: the password grant and the
 * refresh grant answer with the same session shape, and the app must read both
 * through the same field names. A copy in each caller would be two places for
 * `access_token` to drift.
 *
 * The response carries more than this — `token_type`, `expires_in`, the whole
 * `user` — and it is deliberately not modelled: the app sends the access token as
 * it is, and the refresh token back to the endpoint that rotates it. Nothing here
 * decodes a claim, because the server is the only authority on who the token
 * belongs to (RLS still authorizes; the token's user is the client's user).
 */
@Serializable
internal data class GoTrueSession(
    @SerialName("access_token") val accessToken: String,
    @SerialName("refresh_token") val refreshToken: String,
) {
    fun asPair(): TokenPair = TokenPair(accessToken, refreshToken)
}

@Serializable
internal data class GoTrueRefreshRequest(
    @SerialName("refresh_token") val refreshToken: String,
)

@Serializable
internal data class GoTruePasswordRequest(val email: String, val password: String)
