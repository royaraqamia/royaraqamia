package com.royaraqamia.app.chats

import com.royaraqamia.app.contracts.ApiError
import com.royaraqamia.app.contracts.ApiResult
import com.royaraqamia.app.session.Session
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder
import java.util.UUID
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

/** The metadata a message row carries for one uploaded object, as the send route reads it. */
data class ChatAttachmentInput(
    val storagePath: String,
    val fileName: String,
    val mimeType: String,
    val byteSize: Long,
)

/**
 * The storage half of the composer (#933): the put that makes an object, and the
 * removal that leaves nothing behind when the message it belongs to is refused.
 *
 * The site uploads on the session's own client (`frontend/transport/supabase/chat-attachments.ts`),
 * so the bucket's policy — "a member of this thread" — admits the bytes. The app
 * does the same with the same bearer: `POST {storage}/object/{bucket}/{path}` and
 * a bulk `DELETE` of the prefixes. The path is the site's,
 * `{conversationId}/{uuid}/file.{ext}`, so both clients write one object rather
 * than two conventions — and neither puts the member's name in a key storage
 * would refuse (#1241).
 */
interface ChatAttachmentStorage {
    suspend fun upload(conversationId: String, file: ChatComposeFile): ApiResult<ChatAttachmentInput>

    /** Best-effort: the message has already failed, and the daily sweep is the backstop. */
    suspend fun remove(paths: List<String>)
}

/** One answer from the storage endpoint: its status, and the body it carried. */
private data class StorageAnswer(val status: Int, val body: String)

/**
 * The Supabase Storage adapter. [storageUrl] is the project's storage base
 * (`https://<ref>.supabase.co/storage/v1`), and [anonKey] names the project the
 * way the auth client already does.
 */
class SupabaseChatAttachmentStorage(
    private val storageUrl: String,
    private val anonKey: String,
    private val session: Session,
    private val uuid: () -> String = { UUID.randomUUID().toString() },
) : ChatAttachmentStorage {
    override suspend fun upload(
        conversationId: String,
        file: ChatComposeFile,
    ): ApiResult<ChatAttachmentInput> = withContext(Dispatchers.IO) {
        val fileName = ChatAttachments.displayName(file.fileName)
        val mimeType = ChatAttachments.mimeOf(file.mimeType)
        val storagePath = "$conversationId/${uuid()}/${ChatAttachments.objectName(fileName)}"

        var sent = session.attempt() ?: return@withContext ApiResult.Failure(ApiError.NotSignedIn)
        var answer =
            try {
                put(storagePath, sent.accessToken, mimeType, file)
            } catch (error: IOException) {
                return@withContext ApiResult.Failure(ApiError.Network(error.message ?: "unreachable"))
            }
        if (answer.status == UNAUTHORIZED) {
            if (!session.renew(sent.generation)) {
                return@withContext ApiResult.Failure(ApiError.NotSignedIn)
            }
            sent = session.attempt() ?: return@withContext ApiResult.Failure(ApiError.NotSignedIn)
            answer =
                try {
                    put(storagePath, sent.accessToken, mimeType, file)
                } catch (error: IOException) {
                    return@withContext ApiResult.Failure(
                        ApiError.Network(error.message ?: "unreachable")
                    )
                }
        }

        if (answer.status !in 200..299) {
            // The body is the storage service's English diagnostic, not a sentence
            // this screen can draw, so it is deliberately not handed on: the
            // composer's own words are the fallback (ADR-0054's "one language").
            ApiResult.Failure(ApiError.Server(answer.status, ""))
        } else {
            ApiResult.Success(
                ChatAttachmentInput(
                    storagePath = storagePath,
                    fileName = fileName,
                    mimeType = mimeType,
                    byteSize = file.byteSize,
                )
            )
        }
    }

    override suspend fun remove(paths: List<String>) {
        if (paths.isEmpty()) return
        withContext(Dispatchers.IO) {
            val sent = session.attempt() ?: return@withContext
            val body =
                buildJsonObject {
                        put(
                            "prefixes",
                            buildJsonArray { paths.forEach { add(JsonPrimitive(it)) } },
                        )
                    }
                    .toString()
            // Best-effort on purpose: the send already failed, and a second error
            // over the first helps nobody — the daily sweep catches what is left.
            runCatching { delete(paths, sent.accessToken, body) }
        }
    }

    private fun put(
        storagePath: String,
        token: String,
        mimeType: String,
        file: ChatComposeFile,
    ): StorageAnswer {
        val connection =
            URL(objectUrl(storagePath)).openConnection() as HttpURLConnection
        try {
            connection.requestMethod = "POST"
            connection.connectTimeout = CONNECT_TIMEOUT_MS
            connection.readTimeout = READ_TIMEOUT_MS
            connection.instanceFollowRedirects = false
            connection.doOutput = true
            // A provider that knows the size sends it, so the storage API sees a
            // Content-Length; one that does not falls back to chunked, which it
            // also accepts, rather than a number guessed from a stream.
            if (file.byteSize > 0) {
                connection.setFixedLengthStreamingMode(file.byteSize)
            } else {
                connection.setChunkedStreamingMode(0)
            }
            connection.setRequestProperty("Authorization", "Bearer $token")
            connection.setRequestProperty("apikey", anonKey)
            connection.setRequestProperty("Content-Type", mimeType)
            connection.setRequestProperty("x-upsert", "false")

            file.open().use { input ->
                connection.outputStream.use { output -> input.copyTo(output) }
            }
            return answerOf(connection)
        } catch (error: IOException) {
            throw error
        } finally {
            connection.disconnect()
        }
    }

    private fun delete(paths: List<String>, token: String, body: String) {
        val connection = URL("${base()}/${ChatAttachments.BUCKET}").openConnection() as HttpURLConnection
        try {
            connection.requestMethod = "DELETE"
            connection.connectTimeout = CONNECT_TIMEOUT_MS
            connection.readTimeout = READ_TIMEOUT_MS
            connection.instanceFollowRedirects = false
            connection.doOutput = true
            connection.setRequestProperty("Authorization", "Bearer $token")
            connection.setRequestProperty("apikey", anonKey)
            connection.setRequestProperty("Content-Type", "application/json")
            connection.outputStream.use { it.write(body.toByteArray(Charsets.UTF_8)) }
            answerOf(connection)
        } finally {
            connection.disconnect()
        }
    }

    private fun answerOf(connection: HttpURLConnection): StorageAnswer {
        val status = connection.responseCode
        val stream =
            if (status in 200..299) connection.inputStream else connection.errorStream
        val body = stream?.bufferedReader(Charsets.UTF_8)?.use { it.readText() }.orEmpty()
        return StorageAnswer(status, body)
    }

    private fun base(): String = storageUrl.trimEnd('/')

    private fun objectUrl(storagePath: String): String =
        "${base()}/object/${ChatAttachments.BUCKET}/${encodePath(storagePath)}"

    /** Percent-encode each segment, keeping the separators the route expects. */
    private fun encodePath(storagePath: String): String =
        storagePath.split('/').joinToString("/") {
            URLEncoder.encode(it, "UTF-8").replace("+", "%20")
        }

    private companion object {
        const val CONNECT_TIMEOUT_MS = 10_000
        const val READ_TIMEOUT_MS = 60_000
        const val UNAUTHORIZED = 401
    }
}
