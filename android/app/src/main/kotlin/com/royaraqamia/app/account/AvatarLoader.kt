package com.royaraqamia.app.account

import com.royaraqamia.app.net.HttpTransport
import com.royaraqamia.app.net.Transport
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.IOException

/**
 * The bytes an avatar URL answered, or `null` when there is nothing to draw
 * (#945).
 *
 * An avatar is a picture, not a body the contract codec reads, so it has its own
 * small seam: the card asks for bytes, and a failed read is the initial letter
 * rather than a hole. The interface is here so the fallback can be tested with
 * no socket, and so a cached loader can replace the network one without the card
 * learning how it was fetched.
 */
fun interface AvatarLoader {
    suspend fun load(url: String): ByteArray?
}

/**
 * The loader the app ships: the one [Transport], on IO.
 *
 * The URL is absolute (the avatars bucket's public URL), so it is not prefixed
 * with the site base the way a route is. A 404, an unreachable server or a body
 * with no bytes all answer `null`: the card's fallback is the same for every one
 * of them, and none is worth a sentence of its own on a profile row.
 */
class TransportAvatarLoader(
    private val transport: Transport = HttpTransport,
) : AvatarLoader {
    override suspend fun load(url: String): ByteArray? =
        withContext(Dispatchers.IO) {
            try {
                val answer =
                    transport.sendBytes(
                        method = "GET",
                        url = url,
                        headers = mapOf("Accept" to "image/*"),
                        body = null,
                    )
                answer.bytes.takeIf { answer.status in 200..299 && it.isNotEmpty() }
            } catch (_: IOException) {
                null
            } catch (_: ClassCastException) {
                // A stored URL that is not http(s) cannot become an
                // `HttpURLConnection`; the card draws the initial instead of
                // crashing on a row the server let through.
                null
            }
        }
}
