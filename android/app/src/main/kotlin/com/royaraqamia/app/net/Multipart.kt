package com.royaraqamia.app.net

import java.io.ByteArrayOutputStream
import java.util.UUID

/**
 * One file part in a `multipart/form-data` body (#945).
 *
 * [fieldName] is the name the route reads it under — `file` for
 * `/api/me/avatar`, the same field the page's `ProfileEditor` appends.
 */
data class MultipartFile(
    val fieldName: String,
    val fileName: String,
    val contentType: String,
    val bytes: ByteArray,
)

/**
 * A `multipart/form-data` body, its boundary, and the `Content-Type` that
 * declares both.
 *
 * This is the one place the app spells the format: the route reads it through
 * `req.formData()` exactly as it reads the browser's, so the app cannot send a
 * shape the page does not (#945, ADR-0098).
 *
 * A file name is header data, not user copy: a quote or a newline in it would
 * split the header, so both are replaced before the part is written.
 */
class MultipartBody private constructor(
    val boundary: String,
    val bytes: ByteArray,
) {
    val contentType: String
        get() = "multipart/form-data; boundary=$boundary"

    companion object {
        fun of(file: MultipartFile, boundary: String = UUID.randomUUID().toString()): MultipartBody {
            val output = ByteArrayOutputStream()

            fun write(text: String) {
                output.write(text.toByteArray(Charsets.UTF_8))
            }

            write("--$boundary$CRLF")
            write(
                "Content-Disposition: form-data; name=\"${headerSafe(file.fieldName)}\"; " +
                    "filename=\"${headerSafe(file.fileName)}\"$CRLF"
            )
            write("Content-Type: ${headerSafe(file.contentType)}$CRLF")
            write(CRLF)
            output.write(file.bytes)
            write(CRLF)
            write("--$boundary--$CRLF")

            return MultipartBody(boundary, output.toByteArray())
        }

        private const val CRLF = "\r\n"

        /** Keep a value from closing the header it sits in. */
        private fun headerSafe(value: String): String =
            value.replace("\"", "'").replace("\r", " ").replace("\n", " ")
    }
}
