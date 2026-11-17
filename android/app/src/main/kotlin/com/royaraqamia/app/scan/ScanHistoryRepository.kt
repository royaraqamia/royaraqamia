package com.royaraqamia.app.scan

import com.royaraqamia.app.api.ApiClient
import com.royaraqamia.app.contracts.ApiError
import com.royaraqamia.app.contracts.ApiResult
import com.royaraqamia.app.contracts.ContractCodec
import com.royaraqamia.app.contracts.generated.ScanHistoryClearResult
import com.royaraqamia.app.contracts.generated.ScanHistoryRecord
import com.royaraqamia.app.contracts.generated.ScanHistoryRecordResult
import com.royaraqamia.app.contracts.generated.ScanHistoryResult
import com.royaraqamia.app.contracts.generated.ScanHistoryResultEntriesItemKind

/**
 * The scan history's three routes (#1430, ADR-0205): the same `/api/scan/history`
 * collection `frontend/api/scan-history.ts` calls, so the two clients cannot read
 * different lists (ADR-0098).
 *
 * A row is drawn from the server's answer rather than assembled on the phone: the
 * server owns the dedupe, the count and the Damascus day, and an optimistic row
 * would disagree with all three.
 */
class ScanHistoryRepository(private val client: ApiClient) {
    suspend fun read(): ApiResult<List<ScanHistoryEntry>> =
        when (val result = client.get<ScanHistoryResult>(PATH)) {
            is ApiResult.Success -> {
                val body = result.value
                if (!body.success) {
                    ApiResult.Failure(ApiError.Server(200, body.error.orEmpty()))
                } else {
                    ApiResult.Success(
                        body.entries.orEmpty().map { entry ->
                            ScanHistoryEntry(
                                id = entry.id,
                                kind = kindOf(entry.kind),
                                label = entry.label,
                                lastSeenDate = entry.lastSeenDate,
                                seenCount = entry.seenCount,
                            )
                        }
                    )
                }
            }
            is ApiResult.Failure -> result
        }

    /** Count the code once. The summary is built by [ScanHistorySummary]. */
    suspend fun record(record: ScanHistoryRecord): ApiResult<Unit> =
        answer(client.post<ScanHistoryRecordResult>(PATH, ContractCodec.encode(record)))

    /** The whole list, gone. Answers how many rows went. */
    suspend fun clear(): ApiResult<Long> =
        when (val result = client.delete<ScanHistoryClearResult>(PATH)) {
            is ApiResult.Success -> {
                val body = result.value
                if (body.success) {
                    ApiResult.Success(body.cleared ?: 0L)
                } else {
                    ApiResult.Failure(ApiError.Server(200, body.error.orEmpty()))
                }
            }
            is ApiResult.Failure -> result
        }

    private fun answer(result: ApiResult<ScanHistoryRecordResult>): ApiResult<Unit> =
        when (result) {
            is ApiResult.Success ->
                if (result.value.success) {
                    ApiResult.Success(Unit)
                } else {
                    ApiResult.Failure(ApiError.Server(200, result.value.error.orEmpty()))
                }
            is ApiResult.Failure -> result
        }

    private fun kindOf(kind: ScanHistoryResultEntriesItemKind): ScanResultKind =
        when (kind) {
            ScanHistoryResultEntriesItemKind.LINK -> ScanResultKind.Link
            ScanHistoryResultEntriesItemKind.EMAIL -> ScanResultKind.Email
            ScanHistoryResultEntriesItemKind.PHONE -> ScanResultKind.Phone
            ScanHistoryResultEntriesItemKind.SMS -> ScanResultKind.Sms
            ScanHistoryResultEntriesItemKind.WIFI -> ScanResultKind.Wifi
            ScanHistoryResultEntriesItemKind.CONTACT -> ScanResultKind.Contact
            ScanHistoryResultEntriesItemKind.LOCATION -> ScanResultKind.Location
            ScanHistoryResultEntriesItemKind.OTP -> ScanResultKind.Otp
            ScanHistoryResultEntriesItemKind.TEXT -> ScanResultKind.Text
        }

    companion object {
        const val PATH = "/api/scan/history"
    }
}

/** One row as the section draws it: a service name, a count and a day. */
data class ScanHistoryEntry(
    val id: String,
    val kind: ScanResultKind,
    val label: String?,
    val lastSeenDate: String,
    val seenCount: Long,
)
