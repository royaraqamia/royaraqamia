package com.royaraqamia.app.realtime

import android.util.Base64
import java.io.ByteArrayOutputStream
import java.io.IOException
import java.io.InputStream
import java.io.OutputStream
import java.net.InetSocketAddress
import java.net.Socket
import java.net.URI
import java.security.MessageDigest
import java.security.SecureRandom
import javax.net.ssl.SSLSocket
import javax.net.ssl.SSLSocketFactory

/**
 * The one thing the Realtime client needs from a socket: send text, and hear text
 * or a close (ADR-0141).
 *
 * The seam exists so the Phoenix protocol and its reconnect rules can be tested
 * on a JVM with no network, and so a platform WebSocket could replace the
 * hand-rolled one without touching the client above it.
 */
interface RealtimeSocket {
    fun send(text: String)

    fun close()

    interface Listener {
        fun onText(text: String)

        fun onClosed(reason: String)
    }
}

/** Opens one socket. One implementation ships; tests hand in a scripted fake. */
fun interface RealtimeSocketFactory {
    fun open(url: String, headers: Map<String, String>, listener: RealtimeSocket.Listener): RealtimeSocket
}

/**
 * A minimal RFC 6455 client, because the app carries no WebSocket dependency
 * (ADR-0141 keeps it that way: a library would be a dependency added for one
 * socket while every other request is `HttpURLConnection`).
 *
 * Only what Realtime needs is implemented: the HTTP upgrade, text frames,
 * fragmentation, ping/pong and close. The client masks every frame, as the
 * protocol requires; the reader accepts unmasked server frames.
 */
object Rfc6455WebSocketFactory : RealtimeSocketFactory {
    private const val CONNECT_TIMEOUT_MS = 15_000
    private const val READ_TIMEOUT_MS = 90_000
    private const val GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"
    private const val MAX_FRAME_BYTES = 8 * 1024 * 1024

    override fun open(
        url: String,
        headers: Map<String, String>,
        listener: RealtimeSocket.Listener,
    ): RealtimeSocket {
        val uri = URI(url)
        val secure = uri.scheme == "wss"
        require(secure || uri.scheme == "ws") { "Realtime needs a ws:// or wss:// URL" }

        val host = uri.host ?: throw IOException("Realtime URL has no host")
        val port = if (uri.port != -1) uri.port else if (secure) 443 else 80
        val plain = Socket()
        plain.connect(InetSocketAddress(host, port), CONNECT_TIMEOUT_MS)
        val socket: Socket =
            if (secure) {
                val ssl =
                    (SSLSocketFactory.getDefault() as SSLSocketFactory)
                        .createSocket(plain, host, port, true) as SSLSocket
                ssl.sslParameters =
                    ssl.sslParameters.apply { endpointIdentificationAlgorithm = "HTTPS" }
                ssl.startHandshake()
                ssl
            } else {
                plain
            }
        socket.soTimeout = READ_TIMEOUT_MS

        val input = socket.getInputStream()
        val output = socket.getOutputStream()
        val key = ByteArray(16).also { SecureRandom().nextBytes(it) }.let {
            Base64.encodeToString(it, Base64.NO_WRAP)
        }
        val path = (uri.rawPath.ifEmpty { "/" }) + (uri.rawQuery?.let { "?$it" } ?: "")
        val request =
            buildString {
                append("GET ").append(path).append(" HTTP/1.1\r\n")
                append("Host: ").append(if (port == if (secure) 443 else 80) host else "$host:$port").append("\r\n")
                append("Upgrade: websocket\r\n")
                append("Connection: Upgrade\r\n")
                append("Sec-WebSocket-Key: ").append(key).append("\r\n")
                append("Sec-WebSocket-Version: 13\r\n")
                headers.forEach { (name, value) -> append(name).append(": ").append(value).append("\r\n") }
                append("\r\n")
            }
        output.write(request.toByteArray(Charsets.UTF_8))
        output.flush()

        val response = readHeaders(input)
        val statusLine = response.lineSequence().firstOrNull().orEmpty()
        if (!statusLine.contains(" 101 ")) {
            runCatching { socket.close() }
            throw IOException("the WebSocket handshake was refused: ${statusLine.take(120)}")
        }
        val accept =
            response.lineSequence()
                .firstOrNull { it.startsWith("sec-websocket-accept:", ignoreCase = true) }
                ?.substringAfter(':')
                ?.trim()
        if (accept != acceptFor(key)) {
            runCatching { socket.close() }
            throw IOException("the WebSocket handshake answered the wrong accept key")
        }

        return Rfc6455Socket(socket, input, output, listener)
    }

    private fun acceptFor(key: String): String {
        val digest =
            MessageDigest.getInstance("SHA-1")
                .digest((key + GUID).toByteArray(Charsets.US_ASCII))
        return Base64.encodeToString(digest, Base64.NO_WRAP)
    }

    private fun readHeaders(input: InputStream): String {
        val out = ByteArrayOutputStream()
        val window = ByteArray(4)
        val marker = "\r\n\r\n".toByteArray(Charsets.US_ASCII)
        while (true) {
            val next = input.read()
            if (next < 0) throw IOException("the server closed during the WebSocket handshake")
            out.write(next)
            System.arraycopy(window, 1, window, 0, 3)
            window[3] = next.toByte()
            if (window.contentEquals(marker)) break
        }
        return out.toString(Charsets.UTF_8.name())
    }

    private class Rfc6455Socket(
        private val socket: Socket,
        private val input: InputStream,
        private val output: OutputStream,
        private val listener: RealtimeSocket.Listener,
    ) : RealtimeSocket {
        private val writeLock = Any()
        private val random = SecureRandom()

        @Volatile
        private var closed = false

        private val reader =
            Thread({ readLoop() }, "roy-realtime-socket").apply {
                isDaemon = true
                start()
            }

        override fun send(text: String) {
            if (closed) return
            runCatching { writeFrame(OPCODE_TEXT, text.toByteArray(Charsets.UTF_8)) }
        }

        override fun close() {
            if (closed) return
            closed = true
            runCatching { writeFrame(OPCODE_CLOSE, ByteArray(0)) }
            runCatching { socket.close() }
        }

        private fun readLoop() {
            val message = ByteArrayOutputStream()
            try {
                while (!closed) {
                    val frame = readFrame() ?: break
                    when (frame.opcode) {
                        OPCODE_CLOSE -> break
                        OPCODE_PING -> runCatching { writeFrame(OPCODE_PONG, frame.payload) }
                        OPCODE_PONG -> Unit
                        OPCODE_TEXT, OPCODE_CONTINUATION -> {
                            message.write(frame.payload)
                            if (frame.fin) {
                                val text = message.toString(Charsets.UTF_8.name())
                                message.reset()
                                if (!closed) listener.onText(text)
                            }
                        }
                    }
                }
            } catch (_: Exception) {
                // The socket ended. The client hears one close either way, and
                // decides whether to reconnect by whether it still has channels.
            } finally {
                val askedToClose = closed
                closed = true
                runCatching { socket.close() }
                listener.onClosed(if (askedToClose) "closed" else "the socket was lost")
            }
        }

        private fun readFrame(): Frame? {
            val first = input.read()
            if (first < 0) return null
            val second = input.read()
            if (second < 0) return null
            val fin = (first and 0x80) != 0
            val opcode = first and 0x0F
            val masked = (second and 0x80) != 0
            var length = (second and 0x7F).toLong()
            if (length == 126L) length = readUnsigned(2)
            if (length == 127L) length = readUnsigned(8)
            if (length > MAX_FRAME_BYTES) throw IOException("a WebSocket frame larger than the cap")
            val mask = if (masked) readExactly(4) else null
            val payload = readExactly(length.toInt())
            if (mask != null) {
                for (at in payload.indices) {
                    payload[at] = (payload[at].toInt() xor mask[at % 4].toInt()).toByte()
                }
            }
            return Frame(fin, opcode, payload)
        }

        private fun readUnsigned(bytes: Int): Long {
            var value = 0L
            repeat(bytes) { value = (value shl 8) or (readExactly(1)[0].toLong() and 0xFF) }
            return value
        }

        private fun readExactly(count: Int): ByteArray {
            val payload = ByteArray(count)
            var read = 0
            while (read < count) {
                val n = input.read(payload, read, count - read)
                if (n < 0) throw IOException("the WebSocket frame ended early")
                read += n
            }
            return payload
        }

        private fun writeFrame(opcode: Int, payload: ByteArray) {
            val frame = ByteArrayOutputStream()
            frame.write(0x80 or opcode)
            val length = payload.size
            when {
                length < 126 -> frame.write(length)
                length <= 0xFFFF -> {
                    frame.write(126)
                    frame.write((length shr 8) and 0xFF)
                    frame.write(length and 0xFF)
                }
                else -> {
                    frame.write(127)
                    for (shift in 56 downTo 0 step 8) {
                        frame.write(((length.toLong() shr shift) and 0xFF).toInt())
                    }
                }
            }
            val mask = ByteArray(4).also { random.nextBytes(it) }
            frame.write(mask)
            for (at in payload.indices) {
                frame.write((payload[at].toInt() xor mask[at % 4].toInt()) and 0xFF)
            }
            synchronized(writeLock) {
                output.write(frame.toByteArray())
                output.flush()
            }
        }
    }

    private data class Frame(val fin: Boolean, val opcode: Int, val payload: ByteArray)

    private const val OPCODE_CONTINUATION = 0x0
    private const val OPCODE_TEXT = 0x1
    private const val OPCODE_CLOSE = 0x8
    private const val OPCODE_PING = 0x9
    private const val OPCODE_PONG = 0xA
}
