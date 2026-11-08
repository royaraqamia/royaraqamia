package com.royaraqamia.app.scan

import java.net.URI
import java.net.URLDecoder

/** What a decoded payload is, in the vocabulary the page already uses. */
enum class ScanResultKind {
    Link,
    Email,
    Phone,
    Sms,
    Wifi,
    Contact,
    Location,
    Otp,
    Text,
}

/** The fields a `WIFI:` payload carries, after its escapes are honoured. */
data class WifiCredentials(
    val ssid: String,
    val password: String?,
    val encryption: String?,
    val hidden: Boolean,
)

/** The fields an `otpauth://` payload carries. The secret is never expanded here. */
data class OtpDetails(
    val type: String,
    val label: String?,
    val issuer: String?,
    val secret: String,
)

/**
 * One decoded payload, classified before the screen offers anything.
 *
 * A payload is untrusted input from a stranger's sticker (ADR-0034), so every
 * decision about what a visitor may do with it lives here, away from Compose and
 * the camera, and is unit-tested in `ScanClassifierTest`. The page's own
 * classifier is `shared/contracts/scan.ts`; this is its app-side mirror, so a
 * scheme the page refuses is refused on the phone too.
 */
data class ScanClassification(
    val kind: ScanResultKind,
    val value: String,
    val actionHref: String?,
    val actionLabel: String?,
    val host: String?,
    val refusedScheme: String?,
    val deceptive: Boolean,
    val wifi: WifiCredentials? = null,
    val otp: OtpDetails? = null,
)

/**
 * The Scanner's vocabulary and the pure logic that turns a decoded payload into
 * a [ScanClassification] (#932).
 *
 * Nothing here touches the network, the camera or the filesystem. The only
 * server call the Scanner ever makes is the pre-existing public certificate
 * check, and that happens on the verify screen the result routes to — never as
 * part of decoding (ADR-0034).
 */
object ScanClassifier {
    /** Longest payload we will render in full; the rest is truncated but copyable. */
    const val PREVIEW_LENGTH = 400

    /** Longest payload we accept from a detector at all. */
    const val MAX_PAYLOAD_LENGTH = 8192

    /** The label paired with a link the page will open. */
    const val OPEN_LINK = "فتح الرَّابط"

    private val CERT_CODE_REGEX = Regex("^COMP-\\d{4}-[A-Z0-9]{8}$")
    private val SCHEME_PATTERN = Regex("^([a-zA-Z][a-zA-Z0-9+.-]*):")
    private val VERIFY_PATH = Regex("^/verify/([^/?#]+)/?$")
    private val VCARD_NAME = Regex("(?im)^FN(?:;[^:]*)?:(.+)$")

    private val KIND_LABELS =
        mapOf(
            ScanResultKind.Link to "رابط",
            ScanResultKind.Email to "بريد إلكترونيّ",
            ScanResultKind.Phone to "رقم هاتف",
            ScanResultKind.Sms to "رسالة نصِّيَّة",
            ScanResultKind.Wifi to "شبكة WiFi",
            ScanResultKind.Contact to "جهة اتِّصال",
            ScanResultKind.Location to "موقع جغرافيّ",
            ScanResultKind.Otp to "رمز تحقُّق بخطوتين",
            ScanResultKind.Text to "نصّ",
        )

    private val FORMAT_LABELS =
        mapOf(
            "QR_CODE" to "QR",
            "MICRO_QR_CODE" to "QR مصغَّر",
            "AZTEC" to "Aztec",
            "DATA_MATRIX" to "Data Matrix",
            "PDF_417" to "PDF417",
            "CODE_128" to "Code 128",
            "CODE_39" to "Code 39",
            "CODE_93" to "Code 93",
            "CODABAR" to "Codabar",
            "ITF" to "ITF",
            "EAN_13" to "EAN-13",
            "EAN_8" to "EAN-8",
            "UPC_A" to "UPC-A",
            "UPC_E" to "UPC-E",
            "RSS_14" to "GS1 DataBar",
        )

    /** The open actions the page hands to the platform, keyed by scheme. */
    private val OPENABLE_ACTIONS =
        mapOf(
            "mailto:" to (ScanResultKind.Email to "إرسال بريد"),
            "tel:" to (ScanResultKind.Phone to "اتِّصال"),
            "sms:" to (ScanResultKind.Sms to "إرسال رسالة"),
            "geo:" to (ScanResultKind.Location to "فتح الموقع"),
        )

    fun kindLabel(kind: ScanResultKind): String = KIND_LABELS[kind] ?: kind.name

    /** The page's Arabic name for a ZXing format, or the format's own name. */
    fun formatLabel(format: String): String = FORMAT_LABELS[format] ?: format

    /** Truncates for display only. The full [ScanClassification.value] stays intact. */
    fun truncateForDisplay(value: String): String =
        if (value.length > PREVIEW_LENGTH) value.take(PREVIEW_LENGTH) + "…" else value

    /** The display name out of a vCard, when it carries one. */
    fun contactName(value: String): String? = VCARD_NAME.find(value)?.groupValues?.get(1)?.trim()

    /**
     * Classifies a decoded payload and decides the single action, if any, a
     * visitor may take on it. A scheme outside the openable set yields plain text
     * with [ScanClassification.refusedScheme] set: `javascript:`, `data:`,
     * `file:` and `intent:` payloads earn a warning, never an open button.
     */
    fun classify(raw: String): ScanClassification {
        val value = raw.replace("\r\n", "\n").trim()
        if (value.isEmpty()) return text(value)
        if (value.length > MAX_PAYLOAD_LENGTH) return text(value.take(MAX_PAYLOAD_LENGTH))

        val lower = value.lowercase()

        if (lower.startsWith("wifi:")) {
            parseWifiPayload(value)?.let { return text(value).copy(kind = ScanResultKind.Wifi, wifi = it) }
        }

        if (lower.startsWith("otpauth://")) {
            parseOtpPayload(value)?.let { return text(value).copy(kind = ScanResultKind.Otp, otp = it) }
        }

        if (lower.startsWith("begin:vcard")) {
            return text(value).copy(kind = ScanResultKind.Contact)
        }

        val scheme = schemeOf(value)
        if (scheme == "http:" || scheme == "https:") {
            val uri = uriOrNull(value)
            // A raw non-ASCII host leaves `URI.host` empty; the platform URL
            // keeps it, which is exactly the host the deception check needs.
            val host = uri?.host ?: runCatching { java.net.URL(value).host }.getOrNull()
            if (uri != null && host != null) {
                return text(value).copy(
                    kind = ScanResultKind.Link,
                    actionHref = uri.toString(),
                    actionLabel = OPEN_LINK,
                    host = host,
                    deceptive = uri.userInfo != null || isDeceptiveHost(host),
                )
            }
            return text(value)
        }

        if (scheme != null) {
            val action = OPENABLE_ACTIONS[scheme]
            if (action != null) {
                return text(value).copy(
                    kind = action.first,
                    actionHref = value,
                    actionLabel = action.second,
                )
            }
            return text(value, refusedScheme = scheme)
        }

        return text(value)
    }

    /**
     * The Certificate Code inside one of our own verification links, or null.
     *
     * The origin is required, not inferred: a lookalike link on someone else's
     * domain must stay a bare link, because resolving it here would present a
     * stranger's URL as ours.
     */
    fun certificateCodeFromPayload(payload: String, origin: String): String? {
        val scheme = schemeOf(payload)
        if (scheme != "http:" && scheme != "https:") return null
        val uri = uriOrNull(payload) ?: return null
        if (!originOf(uri).equals(origin.trimEnd('/'), ignoreCase = true)) return null
        val match = VERIFY_PATH.find(uri.path.orEmpty()) ?: return null
        val code = decode(match.groupValues[1]).uppercase()
        return if (CERT_CODE_REGEX.matches(code)) code else null
    }

    /** The `WIFI:T:WPA;S:<ssid>;P:<password>;H:<hidden>;;` payload format. */
    fun parseWifiPayload(value: String): WifiCredentials? {
        val fields = mutableMapOf<String, String>()
        val parts = mutableListOf<String>()
        var current = StringBuilder()
        var escaped = false

        for (char in value.drop(5)) {
            if (escaped) {
                current.append(char)
                escaped = false
                continue
            }
            when (char) {
                '\\' -> escaped = true
                ';' -> {
                    parts.add(current.toString())
                    current = StringBuilder()
                }
                else -> current.append(char)
            }
        }
        parts.add(current.toString())

        for (part in parts) {
            val separator = part.indexOf(':')
            if (separator < 1) continue
            fields[part.substring(0, separator).uppercase()] = part.substring(separator + 1)
        }

        val ssid = fields["S"] ?: return null
        return WifiCredentials(
            ssid = ssid,
            password = fields["P"],
            encryption = fields["T"],
            hidden = fields["H"]?.lowercase() == "true",
        )
    }

    /** The `otpauth://totp/Issuer:Account?secret=…&issuer=…` payload format. */
    fun parseOtpPayload(value: String): OtpDetails? {
        val uri = uriOrNull(value) ?: return null
        val secret = queryParam(uri.rawQuery, "secret") ?: return null

        val path = uri.path.orEmpty().removePrefix("/")
        val pathIssuer: String?
        val pathLabel: String?
        if (path.contains(':')) {
            val index = path.indexOf(':')
            pathIssuer = path.substring(0, index).ifEmpty { null }
            pathLabel = path.substring(index + 1).ifEmpty { null }
        } else {
            pathIssuer = null
            pathLabel = path.ifEmpty { null }
        }

        return OtpDetails(
            type = uri.host ?: "totp",
            label = pathLabel,
            issuer = queryParam(uri.rawQuery, "issuer") ?: pathIssuer,
            secret = secret,
        )
    }

    private fun text(value: String, refusedScheme: String? = null): ScanClassification =
        ScanClassification(
            kind = ScanResultKind.Text,
            value = value,
            actionHref = null,
            actionLabel = null,
            host = null,
            refusedScheme = refusedScheme,
            deceptive = false,
        )

    private fun schemeOf(value: String): String? {
        val scheme = SCHEME_PATTERN.find(value)?.groupValues?.get(1) ?: return null
        return "${scheme.lowercase()}:"
    }

    private fun uriOrNull(value: String): URI? = runCatching { URI(value) }.getOrNull()

    /**
     * Punycode (`xn--`) and raw non-ASCII hosts are how a link impersonates a
     * familiar domain, so they earn a warning rather than a silent open.
     */
    private fun isDeceptiveHost(host: String): Boolean {
        if (host.startsWith("xn--", ignoreCase = true) ||
            host.contains(".xn--", ignoreCase = true)
        ) {
            return true
        }
        return host.any { it.code > 127 }
    }

    private fun originOf(uri: URI): String? {
        val authority = uri.rawAuthority ?: return null
        val scheme = uri.scheme?.lowercase() ?: return null
        return "$scheme://$authority"
    }

    private fun queryParam(rawQuery: String?, name: String): String? {
        if (rawQuery.isNullOrEmpty()) return null
        for (pair in rawQuery.split('&')) {
            val separator = pair.indexOf('=')
            if (separator < 1) continue
            if (pair.substring(0, separator) != name) continue
            return decode(pair.substring(separator + 1))
        }
        return null
    }

    private fun decode(value: String): String =
        runCatching { URLDecoder.decode(value, "UTF-8") }.getOrDefault(value)
}
