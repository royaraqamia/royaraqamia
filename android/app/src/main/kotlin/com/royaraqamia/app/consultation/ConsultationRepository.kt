package com.royaraqamia.app.consultation

import com.royaraqamia.app.api.ApiClient
import com.royaraqamia.app.contracts.ApiError
import com.royaraqamia.app.contracts.ApiResult
import com.royaraqamia.app.contracts.generated.AvailabilitySlotsResponse
import com.royaraqamia.app.contracts.generated.AvailabilitySlotsResponseSlotsItem
import com.royaraqamia.app.contracts.generated.BookingResult
import com.royaraqamia.app.contracts.generated.ConsultationPackagesResponse
import com.royaraqamia.app.contracts.generated.ConsultationPackagesResponsePackagesItem
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.add
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonArray

/** What one booking attempt came to, which is what the screen draws (#930). */
sealed interface BookingAttempt {
    /** The server took the booking; the reference code is the visitor's to quote. */
    data class Confirmed(val referenceCode: String) : BookingAttempt

    /** A slot was taken between the read and the write; the calendar is stale. */
    data class Taken(val message: String) : BookingAttempt

    /** The server refused the body, with its own sentence. */
    data class Refused(val message: String) : BookingAttempt

    /** The request never reached an answer. */
    data class Unreachable(val message: String) : BookingAttempt

    /** No radio: the screen must not offer the write at all. */
    data object Offline : BookingAttempt
}

/**
 * Consultation booking's one seam (#930).
 *
 * Booking reserves a scarce Availability Slot against a live conflict check, so
 * it is the one surface that may never queue (ADR-0031): there is no Outbox here,
 * and [book] refuses to send when the radio is off. The two reads are the page's
 * own public routes, and the write is the same `POST /api/consultation/bookings`
 * the page sends, so a booking made in the app lands in the table the operator
 * already works from.
 *
 * A `409` is its own outcome because the screen has a different next move for it:
 * say the slot was taken and read the calendar again. Every other refusal is the
 * server's sentence, kept rather than replaced with a generic one.
 */
class ConsultationRepository(
    private val client: ApiClient,
    private val online: () -> Boolean = { true },
) {
    private val json = Json { ignoreUnknownKeys = true }

    fun isOnline(): Boolean = online()

    suspend fun packages(): ApiResult<List<ConsultationPackagesResponsePackagesItem>> =
        when (
            val answer =
                client.getPublic(PACKAGES_PATH, ConsultationPackagesResponse.serializer())
        ) {
            is ApiResult.Success -> ApiResult.Success(answer.value.packages)
            is ApiResult.Failure -> answer
        }

    suspend fun slots(): ApiResult<List<AvailabilitySlotsResponseSlotsItem>> =
        when (
            val answer = client.getPublic(SLOTS_PATH, AvailabilitySlotsResponse.serializer())
        ) {
            is ApiResult.Success -> ApiResult.Success(answer.value.slots)
            is ApiResult.Failure -> answer
        }

    suspend fun book(draft: ConsultationDraft): BookingAttempt = withContext(Dispatchers.IO) {
        if (!online()) return@withContext BookingAttempt.Offline

        val body =
            buildJsonObject {
                    put("package_id", draft.packageId)
                    putJsonArray("slot_ids") { draft.slotIds.forEach { add(it) } }
                    put("full_name", draft.fullName.trim())
                    put("phone_whatsapp", draft.phone.trim())
                    put("topic_description", draft.topic.trim())
                }
                .toString()

        when (val answer = client.postPublic(BOOKINGS_PATH, body, BookingResult.serializer())) {
            is ApiResult.Success -> {
                val result = answer.value
                val reference = result.referenceCode
                when {
                    result.success && !reference.isNullOrBlank() ->
                        BookingAttempt.Confirmed(reference)
                    else -> BookingAttempt.Refused(result.error ?: ConsultationCopy.BOOKING_FAILED)
                }
            }
            is ApiResult.Failure ->
                when (val error = answer.error) {
                    is ApiError.Server -> {
                        val message = messageOf(error.detail) ?: ConsultationCopy.GENERIC_ERROR
                        if (error.status == SLOT_TAKEN_STATUS) BookingAttempt.Taken(message)
                        else BookingAttempt.Refused(message)
                    }
                    is ApiError.Network -> BookingAttempt.Unreachable(ConsultationCopy.BOOKING_UNREACHABLE)
                    is ApiError.InvalidContract -> BookingAttempt.Refused(ConsultationCopy.GENERIC_ERROR)
                    ApiError.NotSignedIn -> BookingAttempt.Refused(ConsultationCopy.GENERIC_ERROR)
                }
        }
    }

    private fun messageOf(body: String): String? =
        runCatching {
                json.parseToJsonElement(body).jsonObject["error"]?.jsonPrimitive?.content
            }
            .getOrNull()
            ?.takeIf { it.isNotBlank() }

    companion object {
        const val PACKAGES_PATH = "/api/consultation/packages"
        const val SLOTS_PATH = "/api/consultation/slots"
        const val BOOKINGS_PATH = "/api/consultation/bookings"

        /** The server's conflict answer: one of the chosen slots is no longer free. */
        const val SLOT_TAKEN_STATUS = 409
    }
}
