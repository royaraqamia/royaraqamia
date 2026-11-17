package com.royaraqamia.app.scan

import com.royaraqamia.app.contracts.generated.ScanHistoryRecord
import com.royaraqamia.app.contracts.generated.ScanHistoryRecordKind

/**
 * What a scan leaves behind, computed on the phone (ADR-0205, #1430).
 *
 * The page's own builder is `shared/contracts/scan-history.ts`, and the two must
 * agree: `shared/fixtures/scan-history-labels.json` is read by this file's test
 * and by the page's, so a rule changed on one side fails on the other.
 *
 * The payload never leaves the device. The record this builds has three fields
 * and no room for a fourth, which is what makes "we do not store the code" true
 * of the request rather than of the server.
 */
object ScanHistorySummary {
    /** The longest label the route accepts. */
    const val LABEL_MAX = 120

    /** The mask in front of the last three digits of a number. */
    private const val MASK = "••• "

    private val NOT_A_NAME = Regex("[^a-z0-9_]+")

    fun of(classification: ScanClassification, format: String): ScanHistoryRecord =
        ScanHistoryRecord(
            kind = kindOf(classification.kind),
            format = normalizeFormat(format),
            label = labelFor(classification),
        )

    fun kindOf(kind: ScanResultKind): ScanHistoryRecordKind =
        when (kind) {
            ScanResultKind.Link -> ScanHistoryRecordKind.LINK
            ScanResultKind.Email -> ScanHistoryRecordKind.EMAIL
            ScanResultKind.Phone -> ScanHistoryRecordKind.PHONE
            ScanResultKind.Sms -> ScanHistoryRecordKind.SMS
            ScanResultKind.Wifi -> ScanHistoryRecordKind.WIFI
            ScanResultKind.Contact -> ScanHistoryRecordKind.CONTACT
            ScanResultKind.Location -> ScanHistoryRecordKind.LOCATION
            ScanResultKind.Otp -> ScanHistoryRecordKind.OTP
            ScanResultKind.Text -> ScanHistoryRecordKind.TEXT
        }

    /** ZXing's `QR_CODE` and the page's `qr_code` are one format. */
    fun normalizeFormat(format: String): String {
        val folded = format.lowercase().replace(NOT_A_NAME, "_").trim('_').take(32)
        return folded.ifEmpty { "unknown" }
    }

    /** The part of the payload that identifies the code without being its secret. */
    fun labelFor(classification: ScanClassification): String? =
        when (classification.kind) {
            ScanResultKind.Link -> clean(classification.host)
            ScanResultKind.Email -> clean(domainOf(classification.value))
            ScanResultKind.Phone, ScanResultKind.Sms -> maskedNumber(classification.value)
            ScanResultKind.Wifi -> clean(classification.wifi?.ssid)
            ScanResultKind.Contact -> clean(ScanClassifier.contactName(classification.value))
            // The issuer names the service; the path label often carries the account.
            ScanResultKind.Otp -> clean(classification.otp?.issuer)
            ScanResultKind.Location, ScanResultKind.Text -> null
        }

    /** The domain of a `mailto:` payload, without the person. */
    private fun domainOf(value: String): String? {
        val withoutQuery = value.substringBefore('?')
        val at = withoutQuery.lastIndexOf('@')
        return if (at > 0) withoutQuery.substring(at + 1) else null
    }

    /** `+963 999 123 456` -> `••• 456`: enough to recognise, not enough to call. */
    private fun maskedNumber(value: String): String? {
        // ASCII digits on purpose: the page strips `\D`, which does not include
        // Arabic-Indic numerals, so the two would otherwise keep different tails.
        val digits = value.filter { it in '0'..'9' }
        return if (digits.length >= 3) MASK + digits.takeLast(3) else null
    }

    /** One printable line, folded and bounded like the page's `clean`. */
    private fun clean(value: String?): String? {
        if (value.isNullOrEmpty()) return null
        val folded =
            value
                .map { char -> if (char.code < 0x20 || char.code == 0x7f) ' ' else char }
                .joinToString("")
                .replace(Regex("\\s+"), " ")
                .trim()
        if (folded.isEmpty()) return null
        return if (folded.length > LABEL_MAX) folded.take(LABEL_MAX).trim() else folded
    }
}
