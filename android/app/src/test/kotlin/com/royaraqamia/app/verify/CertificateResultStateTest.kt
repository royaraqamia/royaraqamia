package com.royaraqamia.app.verify

import org.junit.Assert.assertEquals
import org.junit.Test
import java.time.LocalDate

/**
 * The card's expiry, as the site computes it (#658).
 *
 * `isCertificateExpired` (`frontend/shared/format.ts`) compares the **UTC** day
 * against the stored date as text, which makes three things true that a naive
 * `!= null` would miss: a certificate expiring today is still valid, one that
 * expired yesterday is not, and one with no expiry never expires.
 */
class CertificateResultStateTest {
    private val today = LocalDate.of(2026, 3, 1)

    @Test
    fun `no expiry never expires`() {
        assertEquals(CertificateResultState.Valid, CertificateResultState.of(null, today))
        assertEquals(CertificateResultState.Valid, CertificateResultState.of("  ", today))
    }

    @Test
    fun `the expiry day itself is still valid`() {
        assertEquals(CertificateResultState.Valid, CertificateResultState.of("2026-03-01", today))
    }

    @Test
    fun `the day before is expired`() {
        assertEquals(CertificateResultState.Expired, CertificateResultState.of("2026-02-28", today))
    }

    @Test
    fun `a future day is valid`() {
        assertEquals(CertificateResultState.Valid, CertificateResultState.of("2026-03-02", today))
    }
}
