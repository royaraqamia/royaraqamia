package com.royaraqamia.app.chats

import com.royaraqamia.app.contracts.generated.ChatThreadResponseThread
import com.royaraqamia.app.contracts.generated.ChatThreadResponseThreadKind
import com.royaraqamia.app.contracts.generated.ChatThreadResponseThreadParticipantsItem
import com.royaraqamia.app.contracts.generated.ChatThreadResponseThreadParticipantsItemStatus
import com.royaraqamia.app.plans.PlanDates
import com.royaraqamia.app.shared.TimeAgoParts
import com.royaraqamia.app.shared.timeAgoParts
import java.time.Instant
import java.time.ZoneId
import java.time.ZonedDateTime
import java.time.format.DateTimeFormatter
import java.time.format.DecimalStyle
import java.util.Locale

/**
 * The thread's words and its arithmetic, in the site's order (#819).
 *
 * Every sentence is from the generated copy — [ChatsListCopy] for the relative
 * time the tab and the thread share, [ChatThreadCopy] for the rest — and this
 * object only decides which one a value goes into. The thresholds are the shared
 * [timeAgoParts] (ADR-0104), so "three days ago" crosses from hours to days on the
 * same second the browser does.
 */
object ChatText {
    /**
     * A day separator: `السبت 1 نوفمبر`.
     *
     * The site prints it with `Intl.DateTimeFormat('ar-u-nu-latn')`, so the digits
     * are ASCII on a phone whose locale is not ([DecimalStyle.STANDARD] is the same
     * restriction), and the month and weekday names come from the same CLDR data.
     */
    private val day: DateTimeFormatter =
        DateTimeFormatter.ofPattern("EEEE d MMMM", Locale.forLanguageTag("ar"))
            .withDecimalStyle(DecimalStyle.STANDARD)

    /** What a past instant is, in this surface's words. */
    fun timeAgo(iso: String?, now: Instant = Instant.now()): String {
        if (iso == null) return ""
        val parts = timeAgoParts(iso, now)
        return when (parts.unit) {
            TimeAgoParts.Unit.NOW -> ChatsListCopy.AGO_NOW
            TimeAgoParts.Unit.MINUTES -> count(ChatsListCopy.AGO_MINUTES, parts.count)
            TimeAgoParts.Unit.HOURS -> count(ChatsListCopy.AGO_HOURS, parts.count)
            TimeAgoParts.Unit.DAYS -> count(ChatsListCopy.AGO_DAYS, parts.count)
            TimeAgoParts.Unit.WEEKS -> count(ChatsListCopy.AGO_WEEKS, parts.count)
            TimeAgoParts.Unit.DATE -> PlanDates.label(iso)
        }
    }

    /** The day a line belongs to, as the separator words it. */
    fun dayOf(iso: String): String {
        val local =
            runCatching { ZonedDateTime.ofInstant(Instant.parse(iso), ZoneId.systemDefault()) }
                .getOrElse { return iso }
        return day.format(local)
    }

    /** Whether [iso] opens a day the previous line did not. */
    fun isNewDay(previousIso: String?, iso: String): Boolean =
        previousIso == null || previousIso.take(10) != iso.take(10)

    /** The other member of a direct thread, for the header's `@handle`. */
    fun counterpartOf(thread: ChatThreadResponseThread) =
        thread.participants.firstOrNull { it.userId != thread.me?.userId }?.peer

    /** The members who hold a seat: active, or invited and not yet answered. */
    fun membersOf(thread: ChatThreadResponseThread): List<ChatThreadResponseThreadParticipantsItem> =
        thread.participants.filter {
            it.status == ChatThreadResponseThreadParticipantsItemStatus.ACTIVE ||
                it.status == ChatThreadResponseThreadParticipantsItemStatus.INVITED
        }

    /**
     * What the member's own line says about who has read it (#816).
     *
     * `chat_participants.last_read_at` is the only record — unread is a watermark,
     * not a receipt — so a direct thread says «قُرئت» once the peer's watermark is
     * past the line. A group thread has no UI, so it carries no receipt.
     * The server's roster is what the screen already loaded: no query, no row.
     */
    fun receiptOf(
        thread: ChatThreadResponseThread,
        createdAtIso: String,
        mine: Boolean,
        deleted: Boolean,
    ): String? {
        if (!mine || deleted) return null

        val createdAt = runCatching { Instant.parse(createdAtIso) }.getOrNull() ?: return null
        val meId = thread.me?.userId
        val readers =
            thread.participants.filter { participant ->
                participant.userId != meId &&
                    participant.status == ChatThreadResponseThreadParticipantsItemStatus.ACTIVE &&
                    readPast(participant.lastReadAt, createdAt)
            }

        if (readers.isEmpty()) return null
        return when (thread.kind) {
            ChatThreadResponseThreadKind.GROUP -> null
            ChatThreadResponseThreadKind.DIRECT -> ChatThreadCopy.READ_RECEIPT
            ChatThreadResponseThreadKind.AGENT -> null
        }
    }

    /** A watermark at or past the line means the member has seen it. */
    private fun readPast(lastReadAt: String?, createdAt: Instant): Boolean {
        val readAt = runCatching { Instant.parse(lastReadAt ?: return false) }.getOrNull()
        return readAt != null && !readAt.isBefore(createdAt)
    }

    /**
     * A count, in ASCII: an Arabic-locale phone must not renumber it in
     * Arabic-Indic digits, so the number is written by [Long.toString] rather than
     * by the device's locale.
     */
    private fun count(sentence: String, value: Long): String =
        sentence.replace("{count}", value.toString())
}
