package com.royaraqamia.app.scan

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * The Scanner's classifier (#932), pinned to the page's own
 * `shared/contracts/__tests__/scan.test.ts`.
 *
 * The payload comes from a stranger's sticker, so the tests that matter are the
 * refusals: a `javascript:` scheme must never become an open action, and a link
 * whose host hides behind user-info or punycode must carry its warning.
 */
class ScanClassifierTest {
    private val origin = "https://royaraqamia.com"

    @Test
    fun `reports the host a link actually reaches`() {
        val result = ScanClassifier.classify("$origin/verify/COMP-2026-UHVW9SG5")

        assertEquals(ScanResultKind.Link, result.kind)
        assertEquals("royaraqamia.com", result.host)
        assertEquals("$origin/verify/COMP-2026-UHVW9SG5", result.actionHref)
        assertEquals(ScanClassifier.OPEN_LINK, result.actionLabel)
        assertEquals(false, result.deceptive)
    }

    @Test
    fun `flags embedded user-info`() {
        val result = ScanClassifier.classify("https://royaraqamia.com@evil.example/verify")

        assertEquals(ScanResultKind.Link, result.kind)
        assertEquals("evil.example", result.host)
        assertTrue(result.deceptive)
    }

    @Test
    fun `flags a punycode host`() {
        assertTrue(ScanClassifier.classify("https://xn--royaraqamia-9bb.example/").deceptive)
        assertTrue(ScanClassifier.classify("https://xn--e1afmkfd.example/").deceptive)
    }

    @Test
    fun `offers no open action for a script payload`() {
        val result = ScanClassifier.classify("javascript:alert(document.cookie)")

        assertEquals(ScanResultKind.Text, result.kind)
        assertNull(result.actionHref)
        assertEquals("javascript:", result.refusedScheme)
    }

    @Test
    fun `offers no open action for data or file payloads`() {
        assertEquals(
            "data:",
            ScanClassifier.classify("data:text/html,<script>alert(1)</script>").refusedScheme,
        )
        assertEquals(
            "file:",
            ScanClassifier.classify("file:///C:/Windows/System32/calc.exe").refusedScheme,
        )
    }

    @Test
    fun `keeps plain text plain and trimmed`() {
        val result = ScanClassifier.classify("  مرحبًا بالعالم  ")

        assertEquals(ScanResultKind.Text, result.kind)
        assertEquals("مرحبًا بالعالم", result.value)
        assertNull(result.actionHref)
    }

    @Test
    fun `reads a wifi payload with escaped separators`() {
        val result = ScanClassifier.classify("WIFI:T:WPA;S:My\\;Net;P:p\\:ass;H:true;;")

        assertEquals(ScanResultKind.Wifi, result.kind)
        assertEquals(
            WifiCredentials(
                ssid = "My;Net",
                password = "p:ass",
                encryption = "WPA",
                hidden = true,
            ),
            result.wifi,
        )
        assertNull(result.actionHref)
    }

    @Test
    fun `reads mailto tel sms and geo payloads as their own kinds`() {
        assertEquals(ScanResultKind.Email, ScanClassifier.classify("mailto:hi@example.com").kind)
        assertEquals(ScanResultKind.Phone, ScanClassifier.classify("tel:+963968478904").kind)
        assertEquals(ScanResultKind.Sms, ScanClassifier.classify("sms:+963968478904").kind)
        assertEquals(ScanResultKind.Location, ScanClassifier.classify("geo:33.5138,36.2765").kind)
    }

    @Test
    fun `reads an otpauth payload without expanding its secret`() {
        val result =
            ScanClassifier.classify(
                "otpauth://totp/Royaraqamia:ahm%40example.com?secret=ABCDEF&issuer=Royaraqamia"
            )

        assertEquals(ScanResultKind.Otp, result.kind)
        assertEquals(
            OtpDetails(
                type = "totp",
                label = "ahm@example.com",
                issuer = "Royaraqamia",
                secret = "ABCDEF",
            ),
            result.otp,
        )
    }

    @Test
    fun `reads a vCard and finds its display name`() {
        val result = ScanClassifier.classify("BEGIN:VCARD\nVERSION:3.0\nFN:Ayham Ali\nEND:VCARD")

        assertEquals(ScanResultKind.Contact, result.kind)
        assertEquals("Ayham Ali", ScanClassifier.contactName(result.value))
    }

    @Test
    fun `caps an absurd payload`() {
        val result = ScanClassifier.classify("x".repeat(ScanClassifier.MAX_PAYLOAD_LENGTH + 100))

        assertEquals(ScanClassifier.MAX_PAYLOAD_LENGTH, result.value.length)
    }

    @Test
    fun `leaves a short preview alone and marks a long one`() {
        assertEquals("short", ScanClassifier.truncateForDisplay("short"))
        val long = ScanClassifier.truncateForDisplay("y".repeat(ScanClassifier.PREVIEW_LENGTH + 10))
        assertTrue(long.endsWith("…"))
        assertEquals(ScanClassifier.PREVIEW_LENGTH + 1, long.length)
    }

    @Test
    fun `returns no wifi without an SSID and no OTP without a secret`() {
        assertNull(ScanClassifier.parseWifiPayload("WIFI:T:WPA;P:secret;;"))
        assertNull(ScanClassifier.parseOtpPayload("otpauth://totp/Example?issuer=Example"))
    }

    @Test
    fun `recognises our own verification link in either case and with a trailing slash`() {
        assertEquals(
            "COMP-2026-UHVW9SG5",
            ScanClassifier.certificateCodeFromPayload(
                "$origin/verify/COMP-2026-UHVW9SG5",
                origin,
            ),
        )
        assertEquals(
            "COMP-2026-UHVW9SG5",
            ScanClassifier.certificateCodeFromPayload(
                "$origin/verify/comp-2026-uhvw9sg5/",
                origin,
            ),
        )
    }

    @Test
    fun `refuses a lookalike origin and a malformed code`() {
        assertNull(
            ScanClassifier.certificateCodeFromPayload(
                "https://evil.example/verify/COMP-2026-UHVW9SG5",
                origin,
            )
        )
        assertNull(
            ScanClassifier.certificateCodeFromPayload("$origin/verify/NOT-A-CODE", origin)
        )
        assertNull(
            ScanClassifier.certificateCodeFromPayload(
                "$origin/community/COMP-2026-UHVW9SG5",
                origin,
            )
        )
        assertNull(ScanClassifier.certificateCodeFromPayload("COMP-2026-UHVW9SG5", origin))
    }
}
