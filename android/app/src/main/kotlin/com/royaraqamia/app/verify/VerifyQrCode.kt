package com.royaraqamia.app.verify

import com.google.zxing.BarcodeFormat
import com.google.zxing.EncodeHintType
import com.google.zxing.common.BitMatrix
import com.google.zxing.qrcode.QRCodeWriter
import com.google.zxing.qrcode.decoder.ErrorCorrectionLevel

/**
 * The seal a shared certificate carries (#658).
 *
 * A printed certificate's QR is the link a stranger scans to reach this page, and
 * the site draws it from the certificate code (`CertificateQRCodeClient`, with the
 * `qrcode` package: error correction M, margin 2). The app encodes the same string
 * with the same parameters from the reference implementation of the same standard
 * (ISO/IEC 18004), so the code on the paper and the code on the screen point at the
 * same URL and scan the same way.
 *
 * The matrix is what this class answers, not a bitmap: the module grid is the
 * drawing, and the screen turns it into pixels so a test can decode the result
 * without a device ([VerifyQrCodeTest] round-trips it).
 */
object VerifyQrCode {
    /** The site's own QR parameters: correction level M, a two-module quiet zone. */
    private const val QUIET_ZONE = 2

    /**
     * The link a certificate's seal encodes: the site's canonical verify URL.
     *
     * It is the page's own address, not a custom scheme: a scanner held by someone
     * who has never installed the app must still open in a browser.
     */
    fun urlFor(siteUrl: String, code: String): String =
        "${siteUrl.trimEnd('/')}/verify/${code.trim().uppercase()}"

    /** [content] as a square QR matrix, or null when the encoder refuses it. */
    fun matrix(content: String, size: Int = 512): BitMatrix? =
        runCatching {
            QRCodeWriter()
                .encode(
                    content,
                    BarcodeFormat.QR_CODE,
                    size,
                    size,
                    mapOf(
                        EncodeHintType.ERROR_CORRECTION to ErrorCorrectionLevel.M,
                        EncodeHintType.MARGIN to QUIET_ZONE,
                    ),
                )
        }
            .getOrNull()
}
