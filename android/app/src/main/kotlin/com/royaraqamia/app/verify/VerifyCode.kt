package com.royaraqamia.app.verify

/**
 * The certificate code's format, as the site's field judges it (#658).
 *
 * The reference is `CERT_CODE_REGEX` in `shared/contracts/certificate-code.ts` —
 * `COMP-YYYY-XXXXXXXX`, four digits and eight upper-case alphanumerics — which is
 * the same pattern the scanner uses to recognise our own verification links.
 *
 * The format is a hint, never a gate: the site lets a visitor submit anything and
 * lets the server answer, because the record is the server's. This mirrors the
 * two things the field *does* decide: the check mark once the code is well formed,
 * and the format sentence once there is enough of a code to judge (`length >= 5`).
 */
object VerifyCode {
    private val pattern = Regex("""^COMP-\d{4}-[A-Z0-9]{8}$""")

    /** Whether [code] is a whole certificate code. */
    fun isValidFormat(code: String): Boolean = pattern.matches(code.trim().uppercase())

    /** Whether the site would be showing `الصِّيغة الصَّحيحة: …` under this input. */
    fun isSuspicious(code: String): Boolean = code.length >= 5 && !isValidFormat(code)
}
