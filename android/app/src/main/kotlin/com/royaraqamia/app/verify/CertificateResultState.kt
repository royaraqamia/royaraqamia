package com.royaraqamia.app.verify

import java.time.LocalDate
import java.time.ZoneOffset

/**
 * Whether a verified certificate is still in date (#658).
 *
 * The site's card computes this from `isCertificateExpired`
 * (`frontend/shared/format.ts`), which compares the **UTC** calendar day against
 * the stored `expiration_date` as text: a certificate that expired today is still
 * valid today, and one that expired yesterday is not. The comparison is UTC and
 * not the reader's day on purpose — the column is a date the issuer chose, and a
 * visitor in a zone behind UTC must not see a different answer than the record.
 */
sealed interface CertificateResultState {
    /** In date, or with no expiry at all. */
    data object Valid : CertificateResultState

    /** The stored day has passed. */
    data object Expired : CertificateResultState

    companion object {
        /**
         * [expirationDate] as the card's state. A null or blank value is [Valid]:
         * a certificate with no expiry never expires, which is the site's answer
         * too.
         */
        fun of(
            expirationDate: String?,
            today: LocalDate = LocalDate.now(ZoneOffset.UTC),
        ): CertificateResultState {
            if (expirationDate.isNullOrBlank()) return Valid
            return if (today.toString() > expirationDate) Expired else Valid
        }
    }
}
