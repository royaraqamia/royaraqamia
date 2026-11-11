package com.royaraqamia.app.chats

import com.royaraqamia.app.api.ApiClient
import com.royaraqamia.app.contracts.ApiError
import com.royaraqamia.app.contracts.ApiResult
import com.royaraqamia.app.contracts.ContractCodec
import com.royaraqamia.app.contracts.generated.ChatAssistantStateResponse
import com.royaraqamia.app.contracts.generated.ChatAttachmentUrlResponse
import com.royaraqamia.app.contracts.generated.ChatMembersResponse
import com.royaraqamia.app.contracts.generated.ChatMembersResponseMembersItem
import com.royaraqamia.app.contracts.generated.ChatMessagePageResponse
import com.royaraqamia.app.contracts.generated.ChatMessagePageResponseMessagesItem
import com.royaraqamia.app.contracts.generated.ChatMessagePageResponseMessagesItemAttachmentsItem
import com.royaraqamia.app.contracts.generated.ChatMessagePageResponseMessagesItemSenderKind
import com.royaraqamia.app.contracts.generated.ChatMessageResponse
import com.royaraqamia.app.contracts.generated.ChatMessageResponseMessage
import com.royaraqamia.app.contracts.generated.ChatMessageResponseMessageSenderKind
import com.royaraqamia.app.contracts.generated.ChatOkResponse
import com.royaraqamia.app.contracts.generated.ChatStartResponse
import com.royaraqamia.app.contracts.generated.ChatThreadResponse
import com.royaraqamia.app.contracts.generated.ChatThreadResponseThread
import com.royaraqamia.app.contracts.generated.ChatThreadsResponse
import com.royaraqamia.app.contracts.generated.ChatThreadsResponseThreadsItem
import com.royaraqamia.app.store.Identity
import com.royaraqamia.app.store.IdentityScopedStore
import com.royaraqamia.app.store.chats.ChatMessageRow
import com.royaraqamia.app.store.chats.ChatThreadRow
import com.royaraqamia.app.store.chats.ChatsDao
import com.royaraqamia.app.store.chats.ChatsStores
import com.royaraqamia.app.store.outbox.DrainReport
import com.royaraqamia.app.store.outbox.OutboxDrainer
import com.royaraqamia.app.store.outbox.OutboxIntentRow
import com.royaraqamia.app.store.outbox.OutboxQueue
import com.royaraqamia.app.store.outbox.OutboxRules
import com.royaraqamia.app.store.outbox.SendOutcome
import com.royaraqamia.app.store.outbox.SystemWriteClock
import com.royaraqamia.app.store.outbox.WriteClock
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
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

/** Where a line the device still owes stands, as the bubble draws it. */
enum class ChatPending {
    Queued,
    Failed,
}

/**
 * The chats surface's reads and writes (#819), on the device first (#1033, #1127).
 *
 * Every route here is one the site's own components call, with the same body and
 * the same order: the list the tab draws (`GET /api/chats`), one thread
 * (`GET /api/chats/[id]`), a page of its lines (`GET /api/chats/[id]/messages`),
 * and the writes those two screens make. A port that read a narrower route would
 * be a second component with the same name (ADR-0103), so the routes are the
 * site's and the bodies are the generated ones.
 *
 * The device is the first answer (#1033):
 *
 * - [threads], [thread] and [messages] write every answered read into the
 *   identity's Room database, and answer from it when the read cannot (#1127).
 *   The windows are the web's: twenty threads, two hundred lines per thread,
 *   thirty days.
 * - [send] commits the line **and** its replay intent in one transaction, then
 *   drains. The bubble is painted from the store while the queue still owes it;
 *   a replay carries the client-minted id, so the server answers the row the
 *   first attempt wrote instead of adding a second (#1115).
 * - [drain] is the same [OutboxDrainer] the other products drain with, so the
 *   background worker and the screen share one implementation of the queue.
 *
 * Attachments are the port's next slice (#933): the composer cannot stage a file
 * yet, so no attachment can enter the queue here. The store and the transport
 * carry a message's words; the bytes follow the composer that can produce them.
 */
class ChatsRepository(
    private val client: ApiClient,
    private val databases: IdentityScopedStore<ChatsStores>? = null,
    private val identity: () -> Identity = { Identity.Guest },
    /** Whether a request can be sent now; a guest's queue never drains (ADR-0027). */
    private val signedIn: () -> Boolean = { true },
    /** Whether the radio is on. Injected so the JVM suite can pin a drain. */
    private val online: () -> Boolean = { true },
    private val clock: WriteClock = SystemWriteClock,
    private val nowMillis: () -> Long = { System.currentTimeMillis() },
    private val random: () -> Double = { Math.random() },
    /** The storage put and its cleanup; absent in a route test that never uploads. */
    private val attachmentStorage: ChatAttachmentStorage? = null,
) {
    /** One drain at a time, so two triggers cannot race for the same `seq`. */
    private val drainMutex = Mutex()

    private val json = Json {
        ignoreUnknownKeys = true
        explicitNulls = false
    }

    // --- Reads ----------------------------------------------------------------

    /** The signed-in member's id, or null for a guest: a presence stream is per account. */
    fun selfId(): String? = (identity() as? Identity.User)?.id

    /** The tab's rows, written to the device, or the last answer when it cannot. */
    suspend fun threads(): ApiResult<List<ChatThreadsResponseThreadsItem>> =
        withContext(Dispatchers.IO) {
            when (val result = client.get<ChatThreadsResponse>(THREADS_PATH)) {
                is ApiResult.Success -> {
                    val body = result.value
                    if (!body.success) {
                        refused(body.error)
                    } else {
                        val rows = body.threads.orEmpty()
                        saveThreads(rows)
                        ApiResult.Success(rows)
                    }
                }
                is ApiResult.Failure -> {
                    val cached = cachedThreads()
                    if (cached.isNotEmpty()) ApiResult.Success(cached) else result
                }
            }
        }

    /** The rows this device holds, with no request. */
    suspend fun cachedThreads(): List<ChatThreadsResponseThreadsItem> =
        withContext(Dispatchers.IO) {
            val dao = dao() ?: return@withContext emptyList()
            dao.threads(CHAT_THREAD_WINDOW).mapNotNull { decodeThread(it) }
        }

    /** One thread's header, roster and rights, written to the device. */
    suspend fun thread(conversationId: String): ApiResult<ChatThreadResponseThread> =
        withContext(Dispatchers.IO) {
            when (val result = client.get<ChatThreadResponse>(threadPath(conversationId))) {
                is ApiResult.Success -> {
                    val body = result.value
                    val thread = body.thread
                    if (!body.success || thread == null) {
                        refused(body.error)
                    } else {
                        saveHeader(thread)
                        ApiResult.Success(thread)
                    }
                }
                is ApiResult.Failure -> {
                    val cached = cachedThread(conversationId)
                    if (cached != null) ApiResult.Success(cached) else result
                }
            }
        }

    /** The header this device holds, with no request. */
    suspend fun cachedThread(conversationId: String): ChatThreadResponseThread? =
        withContext(Dispatchers.IO) {
            val dao = dao() ?: return@withContext null
            dao.header(conversationId)?.let {
                runCatching {
                        json.decodeFromString(ChatThreadResponseThread.serializer(), it.json)
                    }
                    .getOrNull()
            }
        }

    /** A page of lines, oldest last; `before` is the opaque cursor a page answered. */
    suspend fun messages(
        conversationId: String,
        before: String? = null,
    ): ApiResult<ChatMessages> = withContext(Dispatchers.IO) {
        val query = if (before == null) "" else "?before=" + encode(before)
        when (
            val result = client.get<ChatMessagePageResponse>(messagesPath(conversationId) + query)
        ) {
            is ApiResult.Success ->
                if (result.value.success) {
                    val page = result.value.messages.orEmpty()
                    // Older pages still come from the network (#1033): only the
                    // newest page is the device's window, so only it is written
                    // down and only it can be answered offline.
                    if (before != null) {
                        return@withContext ApiResult.Success(
                            ChatMessages(page, result.value.nextCursor)
                        )
                    }
                    val merged = mergeAndSave(conversationId, page)
                    ApiResult.Success(ChatMessages(merged, result.value.nextCursor))
                } else {
                    refused(result.value.error)
                }
            is ApiResult.Failure -> {
                if (before != null) {
                    result
                } else {
                    val cached = cachedMessages(conversationId)
                    if (cached.isNotEmpty()) {
                        ApiResult.Success(ChatMessages(cached, null))
                    } else {
                        result
                    }
                }
            }
        }
    }

    /** The lines this device holds, newest page included and queued lines among them. */
    suspend fun cachedMessages(conversationId: String): List<ChatMessagePageResponseMessagesItem> =
        withContext(Dispatchers.IO) {
            val dao = dao() ?: return@withContext emptyList()
            dao.messages(conversationId).mapNotNull { decodeMessage(it) }
        }

    // --- Writes ---------------------------------------------------------------

    /**
     * One line, written to the device and queued (#1033, #1127).
     *
     * The row and its intent are committed together, so the line survives the
     * next millisecond whatever the radio does. The drain is attempted right
     * away: online, the server's row replaces the local twin before the next
     * read; offline, the bubble keeps saying the queue owes it. A permanent
     * refusal is kept and surfaced as the warning, never dropped.
     *
     * With no store ([databases] absent, as the route tests construct it) the
     * write is the online request it was before this cache existed.
     */
    suspend fun send(
        conversationId: String,
        body: String,
        senderId: String? = null,
    ): ApiResult<Unit> = withContext(Dispatchers.IO) {
        val dao = dao() ?: return@withContext sendOnline(conversationId, body)

        val clientId = clock.uuid()
        val now = clock.nowIso()
        val local =
            ChatMessagePageResponseMessagesItem(
                id = LOCAL_PREFIX + clientId,
                conversationId = conversationId,
                senderId = senderId,
                senderKind = ChatMessagePageResponseMessagesItemSenderKind.USER,
                body = body,
                replyToId = null,
                editedAt = null,
                deletedAt = null,
                createdAt = now,
                clientId = clientId,
                attachments = emptyList(),
            )
        dao.commitMessage(
            messageRow(local),
            OutboxIntentRow.pending(
                id = clientId,
                entity = conversationId,
                type = MESSAGE_SEND,
                payload =
                    buildJsonObject {
                            put("conversationId", conversationId)
                            put("clientId", clientId)
                            put("body", body)
                        }
                        .toString(),
                createdAt = nowMillis(),
            ),
        )
        drain()
        ApiResult.Success(Unit)
    }

    /**
     * One line and its files, uploaded before the row is written (#933).
     *
     * The bytes go up first, on the session the bucket's policy admits, and the
     * message that follows carries only the metadata — the same order and the same
     * object path the site writes. A refused message removes what it uploaded, so
     * the storage holds no orphan the member cannot see; the daily sweep is the
     * backstop for a cleanup the network drops.
     *
     * A file needs the radio, unlike a line's words: there is no queued copy of a
     * pick, so an upload that fails answers its sentence instead of pretending
     * the queue owes it.
     */
    suspend fun sendWithAttachments(
        conversationId: String,
        body: String,
        files: List<ChatComposeFile>,
        senderId: String? = null,
    ): ApiResult<Unit> = withContext(Dispatchers.IO) {
        if (files.isEmpty()) return@withContext send(conversationId, body, senderId)

        val storage =
            attachmentStorage
                ?: return@withContext ApiResult.Failure(ApiError.Server(500, ""))

        val uploaded = mutableListOf<ChatAttachmentInput>()
        for (file in files) {
            when (val put = storage.upload(conversationId, file)) {
                is ApiResult.Success -> uploaded += put.value
                is ApiResult.Failure -> {
                    storage.remove(uploaded.map { it.storagePath })
                    return@withContext put
                }
            }
        }

        val clientId = clock.uuid()
        val payload =
            buildJsonObject {
                    put("body", body)
                    put("clientId", clientId)
                    put(
                        "attachments",
                        buildJsonArray {
                            uploaded.forEach { attachment ->
                                add(
                                    buildJsonObject {
                                        put("storagePath", attachment.storagePath)
                                        put("fileName", attachment.fileName)
                                        put("mimeType", attachment.mimeType)
                                        put("byteSize", attachment.byteSize)
                                    }
                                )
                            }
                        },
                    )
                }
                .toString()

        when (
            val result =
                client.post<ChatMessageResponse>(messagesPath(conversationId), payload)
        ) {
            is ApiResult.Success -> {
                val message = result.value.message
                if (!result.value.success || message == null) {
                    storage.remove(uploaded.map { it.storagePath })
                    refused(result.value.error)
                } else {
                    dao()?.applyServerMessage(
                        messageRow(pageItemOf(message)),
                        LOCAL_PREFIX + clientId,
                    )
                    ApiResult.Success(Unit)
                }
            }
            is ApiResult.Failure -> {
                storage.remove(uploaded.map { it.storagePath })
                result
            }
        }
    }

    /** The line's state while the queue holds it, keyed by its client id. */
    suspend fun pending(conversationId: String): Map<String, ChatPending> =
        withContext(Dispatchers.IO) {
            val dao = dao() ?: return@withContext emptyMap()
            dao.outbox()
                .filter { it.type == MESSAGE_SEND }
                .mapNotNull { entry ->
                    val payload = payloadOf(entry) ?: return@mapNotNull null
                    val id = payload["conversationId"] ?: return@mapNotNull null
                    if (id != conversationId) return@mapNotNull null
                    val clientId = payload["clientId"] ?: return@mapNotNull null
                    clientId to
                        if (entry.status == OutboxIntentRow.STATUS_FAILED) {
                            ChatPending.Failed
                        } else {
                            ChatPending.Queued
                        }
                }
                .toMap()
        }

    /** Re-arms one failed line, then asks the queue to send it. */
    suspend fun retryMessage(conversationId: String, clientId: String): DrainReport =
        withContext(Dispatchers.IO) {
            dao()?.retryMessage(clientId)
            drain()
        }

    /** Replays the queue once, with the web's rules rather than a second opinion. */
    suspend fun drain(): DrainReport = withContext(Dispatchers.IO) {
        drainMutex.withLock {
            val expected = identity()
            val dao = databases?.forIdentity(expected)?.dao() ?: return@withContext DrainReport(0, 0, 0)
            val queue =
                object : OutboxQueue {
                    override suspend fun entries(): List<OutboxIntentRow> = dao.outbox()

                    override suspend fun remove(seq: Long) = dao.deleteIntent(seq)

                    override suspend fun patch(
                        entry: OutboxIntentRow,
                        attempts: Int,
                        status: String,
                        lastError: String?,
                        nextAttemptAt: Long,
                    ) = dao.patchIntent(entry.seq, attempts, status, lastError, nextAttemptAt)
                }
            OutboxDrainer(
                queue = queue,
                send = { entry -> replay(entry, dao) },
                signedIn = signedIn,
                online = online,
                now = nowMillis,
                random = random,
                stillOurs = { identity() == expected },
            ).drain()
        }
    }

    /** A manual retry of every refused line, then a drain. */
    suspend fun retryFailed(): DrainReport = withContext(Dispatchers.IO) {
        dao()?.retryFailedIntents()
        drain()
    }

    /** What the device owes, without sending anything (the background drain's question). */
    suspend fun outboxStatus(): DrainReport = withContext(Dispatchers.IO) {
        val dao = dao() ?: return@withContext DrainReport(0, 0, 0)
        DrainReport(
            replayed = 0,
            pending = dao.countIntents(OutboxIntentRow.STATUS_PENDING),
            failed = dao.countIntents(OutboxIntentRow.STATUS_FAILED),
        )
    }

    // --- The rest of the surface (online, unchanged) ---------------------------

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
     * A named group, then the thread it opened (#934).
     *
     * The body is the site's own `{ title, memberIds }`, and the cap is the
     * server's: the creator is not one of the invitees, so the form never sends
     * them. A refusal is the server's sentence, drawn rather than thrown.
     */
    suspend fun createGroup(title: String, memberIds: List<String>): ApiResult<String> =
        when (
            val result =
                client.post<ChatStartResponse>(
                    GROUPS_PATH,
                    buildJsonObject {
                            put("title", title)
                            put(
                                "memberIds",
                                buildJsonArray { memberIds.forEach { add(JsonPrimitive(it)) } },
                            )
                        }
                        .toString(),
                )
        ) {
            is ApiResult.Success -> {
                val conversationId = result.value.conversationId
                if (!result.value.success || conversationId == null) {
                    refused(result.value.error)
                } else {
                    ApiResult.Success(conversationId)
                }
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

    /**
     * One assistant turn, streamed into the floating sheet (ADR-0143).
     *
     * The files go up first, on the bucket's own policy, and the turn carries
     * their metadata — the site's order (`use-chat-assistant.ts`) and the same
     * paths. A refused turn removes what it uploaded, so the bucket never holds
     * an object no message names. The frames are parsed a layer up
     * ([com.royaraqamia.app.assistant.parseAssistantEvent]) so this half stays a
     * transport a JVM test can drive with a fake stream.
     */
    suspend fun streamAssistant(
        conversationId: String,
        body: String,
        files: List<ChatComposeFile>,
        onEvent: (com.royaraqamia.app.assistant.AssistantEvent) -> Unit,
    ): ApiResult<Unit> =
        withContext(Dispatchers.IO) {
            val storage = attachmentStorage
            val uploaded = mutableListOf<ChatAttachmentInput>()

            if (files.isNotEmpty()) {
                if (storage == null) return@withContext ApiResult.Failure(ApiError.Server(500, ""))
                for (file in files) {
                    when (val put = storage.upload(conversationId, file)) {
                        is ApiResult.Success -> uploaded += put.value
                        is ApiResult.Failure -> {
                            storage.remove(uploaded.map { it.storagePath })
                            return@withContext put
                        }
                    }
                }
            }

            val payload =
                buildJsonObject {
                        put("body", body)
                        if (uploaded.isNotEmpty()) {
                            put(
                                "attachments",
                                buildJsonArray {
                                    uploaded.forEach { attachment ->
                                        add(
                                            buildJsonObject {
                                                put("storagePath", attachment.storagePath)
                                                put("fileName", attachment.fileName)
                                                put("mimeType", attachment.mimeType)
                                                put("byteSize", attachment.byteSize)
                                            }
                                        )
                                    }
                                },
                            )
                        }
                    }
                    .toString()

            val result =
                client.streamPost(assistantTurnPath(conversationId), payload) { data ->
                    com.royaraqamia.app.assistant.parseAssistantEvent(data)?.let(onEvent)
                }

            // A turn that never landed leaves no message naming those objects.
            if (result is ApiResult.Failure) storage?.remove(uploaded.map { it.storagePath })
            result
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

    // --- Internals ------------------------------------------------------------

    private fun dao(): ChatsDao? = databases?.forIdentity(identity())?.dao()

    private suspend fun sendOnline(conversationId: String, body: String): ApiResult<Unit> =
        when (val result = client.post<ChatMessageResponse>(messagesPath(conversationId), textOf(body))) {
            is ApiResult.Success ->
                if (!result.value.success || result.value.message == null) {
                    refused(result.value.error)
                } else {
                    ApiResult.Success(Unit)
                }
            is ApiResult.Failure -> result
        }

    /**
     * One replay. A 409 is the thread's own refusal (closed, left) and is
     * permanent; the shared classifier retries it for the REST products, so chat
     * names its exception here rather than changing the rule everyone else reads.
     */
    private suspend fun replay(entry: OutboxIntentRow, dao: ChatsDao): SendOutcome {
        val payload = payloadOf(entry) ?: return SendOutcome.Permanent
        val conversationId = payload["conversationId"] ?: return SendOutcome.Permanent
        val clientId = payload["clientId"] ?: return SendOutcome.Permanent
        val body = payload["body"] ?: return SendOutcome.Permanent
        val request =
            buildJsonObject {
                    put("body", body)
                    put("clientId", clientId)
                }
                .toString()

        return when (val answer = client.send("POST", messagesPath(conversationId), request)) {
            is ApiResult.Success -> {
                when (
                    val decoded =
                        ContractCodec.decode(answer.value, ChatMessageResponse.serializer())
                ) {
                    is ApiResult.Success ->
                        if (decoded.value.success && decoded.value.message != null) {
                            dao.applyServerMessage(
                                messageRow(pageItemOf(decoded.value.message)),
                                LOCAL_PREFIX + clientId,
                            )
                            SendOutcome.Accepted
                        } else {
                            SendOutcome.Permanent
                        }
                    // The server took the request but the row is unreadable: a
                    // retry would duplicate it, so it is kept and surfaced.
                    is ApiResult.Failure -> SendOutcome.Permanent
                }
            }
            is ApiResult.Failure ->
                when (val error = answer.error) {
                    is ApiError.Network -> SendOutcome.Transient
                    is ApiError.NotSignedIn -> SendOutcome.Transient
                    is ApiError.InvalidContract -> SendOutcome.Permanent
                    is ApiError.Server ->
                        if (error.status == 409) SendOutcome.Permanent
                        else OutboxRules.classify(error.status)
                }
        }
    }

    private fun payloadOf(entry: OutboxIntentRow): Map<String, String>? =
        runCatching {
                json.parseToJsonElement(entry.payload).jsonObject.mapValues {
                    it.value.jsonPrimitive.content
                }
            }
            .getOrNull()

    private suspend fun saveThreads(rows: List<ChatThreadsResponseThreadsItem>) {
        val dao = dao() ?: return
        prune(dao)
        val storedAt = nowMillis()
        dao.upsertThreads(
            rows.map {
                ChatThreadRow(
                    id = it.id,
                    json = json.encodeToString(ChatThreadsResponseThreadsItem.serializer(), it),
                    lastMessageAt = it.lastMessageAt,
                    createdAt = it.createdAt,
                    storedAt = storedAt,
                )
            }
        )
        dao.trimThreads(CHAT_THREAD_WINDOW)
    }

    private suspend fun saveHeader(thread: ChatThreadResponseThread) {
        val dao = dao() ?: return
        prune(dao)
        dao.upsertHeader(
            com.royaraqamia.app.store.chats.ChatHeaderRow(
                id = thread.id,
                json = json.encodeToString(ChatThreadResponseThread.serializer(), thread),
                storedAt = nowMillis(),
            )
        )
    }

    /**
     * The answered page and the device's queued lines, as one list.
     *
     * The server's page cannot contain a line the queue has not sent yet, and the
     * bubble has to keep drawing it; a server row that carries a client id
     * replaces its local twin, which is the replay arriving (#1115).
     */
    private suspend fun mergeAndSave(
        conversationId: String,
        page: List<ChatMessagePageResponseMessagesItem>,
    ): List<ChatMessagePageResponseMessagesItem> {
        val dao = dao() ?: return page
        prune(dao)
        dao.upsertMessages(page.map(::messageRow))

        val arrived = page.mapNotNull { it.clientId }
        if (arrived.isNotEmpty()) {
            dao.deleteMessages(arrived.map { LOCAL_PREFIX + it })
        }
        dao.trimMessages(conversationId, CHAT_MESSAGE_WINDOW)

        val merged =
            dao.messages(conversationId)
                .mapNotNull { decodeMessage(it) }
                .associateBy { it.id }
                .values
                .sortedBy { it.createdAt }
        return merged
    }

    private suspend fun prune(dao: ChatsDao) {
        val cutoff = nowMillis() - CHAT_RETENTION_MS
        dao.pruneThreads(cutoff)
        dao.pruneHeaders(cutoff)
        dao.pruneMessages(cutoff)
    }

    private fun messageRow(message: ChatMessagePageResponseMessagesItem) =
        ChatMessageRow(
            id = message.id,
            conversationId = message.conversationId,
            clientId = message.clientId,
            createdAt = message.createdAt,
            json = json.encodeToString(ChatMessagePageResponseMessagesItem.serializer(), message),
            storedAt = nowMillis(),
        )

    private fun decodeThread(row: ChatThreadRow): ChatThreadsResponseThreadsItem? =
        runCatching {
                json.decodeFromString(ChatThreadsResponseThreadsItem.serializer(), row.json)
            }
            .getOrNull()

    private fun decodeMessage(row: ChatMessageRow): ChatMessagePageResponseMessagesItem? =
        runCatching {
                json.decodeFromString(ChatMessagePageResponseMessagesItem.serializer(), row.json)
            }
            .getOrNull()

    /** The replay's row as the page's item, so the device keeps one shape. */
    private fun pageItemOf(message: ChatMessageResponseMessage) =
        ChatMessagePageResponseMessagesItem(
            id = message.id,
            conversationId = message.conversationId,
            senderId = message.senderId,
            senderKind = when (message.senderKind) {
                ChatMessageResponseMessageSenderKind.USER ->
                    ChatMessagePageResponseMessagesItemSenderKind.USER
                ChatMessageResponseMessageSenderKind.AGENT ->
                    ChatMessagePageResponseMessagesItemSenderKind.AGENT
                ChatMessageResponseMessageSenderKind.SYSTEM ->
                    ChatMessagePageResponseMessagesItemSenderKind.SYSTEM
            },
            body = message.body,
            replyToId = message.replyToId,
            editedAt = message.editedAt,
            deletedAt = message.deletedAt,
            createdAt = message.createdAt,
            clientId = message.clientId,
            attachments = message.attachments.map {
                ChatMessagePageResponseMessagesItemAttachmentsItem(
                    id = it.id,
                    fileName = it.fileName,
                    mimeType = it.mimeType,
                    byteSize = it.byteSize,
                )
            },
        )

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
        const val GROUPS_PATH = "/api/chats/groups"
        const val BLOCKS_PATH = "/api/chats/blocks"
        const val ASSISTANT_PATH = "/api/chats/assistant"

        /** What one account's list carries, and one thread's newest lines. */
        const val CHAT_THREAD_WINDOW = 20
        const val CHAT_MESSAGE_WINDOW = 200

        /** Thirty days, the web's retention (#1033). */
        const val CHAT_RETENTION_MS = 30L * 24 * 60 * 60 * 1_000

        /** The discriminator the queue stores for a line. */
        const val MESSAGE_SEND = "message.send"

        /** A queued line's local row id; the server's id replaces it on replay. */
        const val LOCAL_PREFIX = "local:"

        fun threadPath(conversationId: String): String = "$THREADS_PATH/$conversationId"

        fun messagesPath(conversationId: String): String = "${threadPath(conversationId)}/messages"

        fun messagePath(messageId: String): String = "$THREADS_PATH/messages/$messageId"

        /** The one streamed route: a turn with the assistant (ADR-0143). */
        fun assistantTurnPath(conversationId: String): String =
            "${threadPath(conversationId)}/assistant"

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
