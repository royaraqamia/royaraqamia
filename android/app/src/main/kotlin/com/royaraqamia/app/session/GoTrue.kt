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
 * The response carries more than this — `token_type`, the rest of `user` — and
 * three fields are modelled beside the pair: the user id, because it names which
 * Local Store the rows belong to (#768), and `expires_at` with `expires_in`,
 * because the document's cookie has to carry the same expiry the server minted
 * (#1194). The user id is a name, not an authorization: the app sends the access
 * token as it is, and the refresh token back to the endpoint that rotates it.
 * Nothing here decodes a claim, because the server is the only authority on who
 * the token belongs to (RLS still authorizes; the token's user is the client's
 * user).
 */
@Serializable
internal data class GoTrueSession(
    @SerialName("access_token") val accessToken: String,
    @SerialName("refresh_token") val refreshToken: String,
    val user: GoTrueUser,
    /** Unix seconds, when the answer says; the jar needs the same number. */
    @SerialName("expires_at") val expiresAt: Long? = null,
    @SerialName("expires_in") val expiresIn: Long? = null,
) {
    /**
     * [raw] is the answer's own body: since #1194 the document's cookie jar
     * receives the session the server minted, and rebuilding it field by field
     * here would be a second copy of a contract GoTrue owns.
     */
    fun asPair(raw: String? = null): TokenPair =
        TokenPair(
            accessToken = accessToken,
            refreshToken = refreshToken,
            userId = user.id,
            expiresAt = expiresAt ?: expiresIn?.let { nowSeconds() + it } ?: 0,
            raw = raw,
        )

    private fun nowSeconds(): Long = System.currentTimeMillis() / 1000
}

/**
 * The one field of `user` the app reads: the id that names the identity a Local
 * Store belongs to (#768).
 *
 * It is a **name, not an authorization**: the app does not verify it, does not
 * decode a claim, and does not use it to decide what may be read — RLS does
 * that, on a token the server minted. What it does decide is which database a
 * row is written into and read from, and for that the server's own answer is
 * better than an unverified JWT claim (`sub`) the client would have to parse.
 */
@Serializable
internal data class GoTrueUser(val id: String)

@Serializable
internal data class GoTrueRefreshRequest(
    @SerialName("refresh_token") val refreshToken: String,
)

@Serializable
internal data class GoTruePasswordRequest(val email: String, val password: String)
