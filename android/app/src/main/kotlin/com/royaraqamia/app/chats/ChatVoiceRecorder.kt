package com.royaraqamia.app.chats

import android.Manifest
import android.content.pm.PackageManager
import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaRecorder
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.Stable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.platform.LocalContext
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.nio.ByteBuffer
import java.nio.ByteOrder
import kotlin.math.sqrt
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.cancelAndJoin
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/**
 * The gateway transcribes WAV natively, so the clip is WAV on both clients
 * (#933). 16 kHz mono keeps a five-minute note under the default 10 MiB
 * per-file allowance; 24 kHz made it 14.4 MB, which the composer refused.
 */
private const val SAMPLE_RATE = 16_000
private const val CHANNEL = AudioFormat.CHANNEL_IN_MONO
private const val ENCODING = AudioFormat.ENCODING_PCM_16BIT

/** The web's ceiling and floor, mirrored (`CHAT_VOICE_NOTE_*`). */
const val VOICE_NOTE_MAX_MS = 5 * 60 * 1_000L
const val VOICE_NOTE_MIN_MS = 1_000L
const val VOICE_LEVEL_BARS = 16

/**
 * The app's voice-note recorder, the composer's microphone (ADR-0127, #933).
 *
 * It is the phone's own capture, not the document's: 24 kHz mono PCM straight
 * from `AudioRecord`, wrapped in the same 44-byte WAV header the site writes, so
 * one transcription path accepts both. A clip is a [ChatComposeFile], which is
 * what the existing upload and `sendWithAttachments` already carry.
 *
 * The gesture is the app's own: tap to start, tap the bar's stop to send or its
 * close to throw it away. A lock and a slide-to-cancel are the document's, where
 * a pointer can leave the control; a thumb on a phone gets the two explicit
 * buttons instead of a gesture it cannot see.
 */
class ChatVoiceRecorder {
    var isRecording by mutableStateOf(false)
        private set
    var isPreparing by mutableStateOf(false)
        private set
    var elapsedMs by mutableStateOf(0L)
        private set
    var levels by mutableStateOf<List<Float>>(emptyList())
        private set

    private var record: AudioRecord? = null
    private var job: Job? = null
    private val pcm = ByteArrayOutputStream()
    private var startedAt = 0L

    /** Opens the microphone and starts capturing. False when the device refuses. */
    fun start(scope: CoroutineScope): Boolean {
        if (isRecording) return true

        pcm.reset()
        val min = AudioRecord.getMinBufferSize(SAMPLE_RATE, CHANNEL, ENCODING)
        val buffer = maxOf(min, SAMPLE_RATE)
        val recorder =
            runCatching {
                    AudioRecord(
                        MediaRecorder.AudioSource.MIC,
                        SAMPLE_RATE,
                        CHANNEL,
                        ENCODING,
                        buffer,
                    )
                }
                .getOrNull() ?: return false
        if (recorder.state != AudioRecord.STATE_INITIALIZED) {
            recorder.release()
            return false
        }
        if (runCatching { recorder.startRecording() }.isFailure) {
            recorder.release()
            return false
        }

        record = recorder
        startedAt = System.currentTimeMillis()
        elapsedMs = 0
        levels = emptyList()
        isRecording = true

        job =
            scope.launch(Dispatchers.IO) {
                val chunk = ShortArray(buffer / 2)
                while (isActive) {
                    if (System.currentTimeMillis() - startedAt >= VOICE_NOTE_MAX_MS) break
                    val read = recorder.read(chunk, 0, chunk.size)
                    if (read <= 0) continue
                    pcm.write(pcmBytes(chunk, read))
                    val level = rms(chunk, read)
                    withContext(Dispatchers.Main) {
                        elapsedMs = System.currentTimeMillis() - startedAt
                        levels = (levels + level).takeLast(VOICE_LEVEL_BARS)
                    }
                }
            }
        return true
    }

    /**
     * Ends the capture without a clip, for a screen that is going away. The
     * suspension in [stop] cannot be used here: the scope is already cancelled.
     */
    fun release() {
        isRecording = false
        job?.cancel()
        job = null
        record?.let {
            runCatching { it.stop() }
            it.release()
        }
        record = null
    }

    /** Stops the capture; the clip when [keep] and long enough, otherwise null. */
    suspend fun stop(keep: Boolean): ChatComposeFile? {
        val recorder = record ?: return null
        val held = System.currentTimeMillis() - startedAt
        isRecording = false
        job?.cancelAndJoin()
        job = null
        runCatching { recorder.stop() }
        recorder.release()
        record = null

        if (!keep || held < VOICE_NOTE_MIN_MS) return null

        isPreparing = true
        return try {
            val bytes = wav(pcm.toByteArray())
            ChatComposeFile(
                fileName = "voice-note.wav",
                mimeType = "audio/wav",
                byteSize = bytes.size.toLong(),
                open = { ByteArrayInputStream(bytes) },
            )
        } finally {
            isPreparing = false
        }
    }
}

/**
 * The composer's recorder, with the microphone permission asked on the first
 * press. A granted permission starts immediately; a refused one leaves the
 * button to ask again, which is the only remedy the platform offers.
 */
@Stable
class VoiceNoteRecorderState internal constructor(
    private val recorder: ChatVoiceRecorder,
    private val scope: CoroutineScope,
    private val request: () -> Unit,
    private val onRecorded: (ChatComposeFile) -> Unit,
) {
    val isRecording: Boolean get() = recorder.isRecording
    val isPreparing: Boolean get() = recorder.isPreparing
    val elapsedMs: Long get() = recorder.elapsedMs
    val levels: List<Float> get() = recorder.levels

    fun record() {
        if (recorder.isRecording) return
        request()
    }

    fun finish() {
        scope.launch {
            recorder.stop(keep = true)?.let(onRecorded)
        }
    }

    fun cancel() {
        scope.launch { recorder.stop(keep = false) }
    }
}

@Composable
fun rememberVoiceNoteRecorder(onRecorded: (ChatComposeFile) -> Unit): VoiceNoteRecorderState {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val recorder = remember { ChatVoiceRecorder() }
    val latest = rememberUpdatedState(onRecorded)

    val permission =
        rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
            if (granted) recorder.start(scope)
        }

    DisposableEffect(Unit) {
        onDispose { recorder.release() }
    }

    return remember(recorder, scope, permission) {
        VoiceNoteRecorderState(
            recorder = recorder,
            scope = scope,
            request = {
                val granted =
                    context.checkSelfPermission(Manifest.permission.RECORD_AUDIO) ==
                        PackageManager.PERMISSION_GRANTED
                if (granted) recorder.start(scope)
                else permission.launch(Manifest.permission.RECORD_AUDIO)
            },
            onRecorded = { latest.value(it) },
        )
    }
}

/** 16-bit mono PCM, little-endian, as WAV's data chunk stores it. */
internal fun pcmBytes(samples: ShortArray, count: Int): ByteArray {
    val bytes = ByteArray(count * 2)
    for (index in 0 until count) {
        val value = samples[index].toInt()
        bytes[index * 2] = (value and 0xFF).toByte()
        bytes[index * 2 + 1] = ((value shr 8) and 0xFF).toByte()
    }
    return bytes
}

/** The loudness of one read, 0–1, for the bar's live waveform. */
private fun rms(samples: ShortArray, count: Int): Float {
    if (count == 0) return 0f
    var sum = 0.0
    for (index in 0 until count) {
        val value = samples[index] / 32_768.0
        sum += value * value
    }
    return sqrt(sum / count).toFloat().coerceIn(0f, 1f)
}

/** A mono 16-bit PCM WAV: the 44-byte header the site also writes. */
internal fun wav(pcm: ByteArray): ByteArray {
    val out = ByteArray(44 + pcm.size)
    val view = ByteBuffer.wrap(out).order(ByteOrder.LITTLE_ENDIAN)
    view.put("RIFF".toByteArray())
    view.putInt(36 + pcm.size)
    view.put("WAVE".toByteArray())
    view.put("fmt ".toByteArray())
    view.putInt(16)
    view.putShort(1)
    view.putShort(1)
    view.putInt(SAMPLE_RATE)
    view.putInt(SAMPLE_RATE * 2)
    view.putShort(2)
    view.putShort(16)
    view.put("data".toByteArray())
    view.putInt(pcm.size)
    view.put(pcm)
    return out
}
