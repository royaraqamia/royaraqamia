package com.royaraqamia.app

import android.content.ComponentName
import android.content.Context
import android.os.Bundle
import androidx.core.content.ContextCompat
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.session.MediaController
import androidx.media3.session.SessionCommand
import androidx.media3.session.SessionToken
import com.google.common.util.concurrent.ListenableFuture
import java.io.File
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/** The recitation's face at one instant, as the panel paints it. */
enum class QuranPlayerStatus {
    IDLE,
    LOADING,
    PLAYING,
    PAUSED,
    OFFLINE,
    FAILED,
}

/**
 * Everything a controller panel needs, and nothing it does not.
 *
 * The service owns the queue and the player (ADR-0086); this is the snapshot the
 * app reads off it, shaped like the web engine's state so both clients paint the
 * same faces.
 */
data class QuranPlayerSnapshot(
    val status: QuranPlayerStatus = QuranPlayerStatus.IDLE,
    val surah: Int? = null,
    val name: String? = null,
    val ayah: Int = 1,
    val ayahCount: Int = 0,
    val positionSeconds: Double = 0.0,
    val durationSeconds: Double = 0.0,
    /** What this device holds for the surah: `none`, `partial` or `complete`. */
    val saved: String? = null,
)

/**
 * The app's controller over the recitation service (#956).
 *
 * It holds a media3 [MediaController], never an ExoPlayer: the one player in the
 * process is the service's, and this is the client half the Compose panel draws
 * from. Play, pause and stop are the session's own commands; loading a sura is
 * the same custom command `QuranPlayerPlugin` sends for the web, so the page and
 * the app take one path into the service.
 *
 * Releasing the controller does **not** stop the service: a screen that leaves
 * must not silence a recitation the notification is still playing. Only the
 * panel's stop, or the notification's, ends it.
 */
class QuranPlayerController(
    context: Context,
    private val origin: String = BuildConfig.SITE_URL,
) {
    private val appContext = context.applicationContext
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    private val _state = MutableStateFlow(QuranPlayerSnapshot())
    val state: StateFlow<QuranPlayerSnapshot> = _state.asStateFlow()

    private var controller: MediaController? = null
    private var future: ListenableFuture<MediaController>? = null
    private var progress: Job? = null

    private val listener =
        object : Player.Listener {
            override fun onEvents(player: Player, events: Player.Events) {
                publish()
            }

            override fun onIsPlayingChanged(isPlaying: Boolean) {
                if (isPlaying) startProgress() else publish()
            }
        }

    /** Binds to the service on the main thread; enough to read and drive it. */
    fun connect() {
        val existing = controller
        if (existing != null && existing.isConnected) return
        // A stop ends the service, and media3 disconnects the controller with it.
        // The next play has to build a new one rather than drive the dead one.
        if (existing != null) {
            existing.removeListener(listener)
            existing.release()
            controller = null
        }
        val pending = future
        if (pending != null && !pending.isDone) return
        future = null
        val token =
            SessionToken(
                appContext,
                ComponentName(appContext, QuranPlaybackService::class.java),
            )
        val built = MediaController.Builder(appContext, token).buildAsync()
        future = built
        built.addListener(
            {
                try {
                    val connected = built.get()
                    if (future !== built) {
                        connected.release()
                        return@addListener
                    }
                    connected.addListener(listener)
                    controller = connected
                    publish()
                    if (connected.isPlaying) startProgress()
                } catch (failure: Exception) {
                    if (future === built) {
                        future = null
                        if (_state.value.status == QuranPlayerStatus.LOADING) {
                            _state.value = _state.value.copy(status = QuranPlayerStatus.OFFLINE)
                        }
                    }
                }
            },
            ContextCompat.getMainExecutor(appContext),
        )
    }

    /** Starts this sura, or resumes it if the service already holds it. */
    fun play(surah: Int, ayah: Int = 1) {
        _state.value =
            _state.value.copy(
                status = QuranPlayerStatus.LOADING,
                surah = surah,
                ayah = ayah,
            )
        withController { player ->
            val args =
                Bundle().apply {
                    putInt("surah", surah)
                    putInt("ayah", ayah)
                    putDouble("offset", 0.0)
                    putString("origin", origin)
                }
            val result =
                player.sendCustomCommand(
                    SessionCommand(QuranPlaybackService.ACTION_LOAD, Bundle.EMPTY),
                    args,
                )
            result.addListener(
                {
                    val loaded = runCatching { result.get() }.getOrNull()
                    if (loaded == null) {
                        _state.value = _state.value.copy(status = QuranPlayerStatus.OFFLINE)
                    } else {
                        publish()
                    }
                },
                ContextCompat.getMainExecutor(appContext),
            )
        }
    }

    /** Pauses a sounding recitation, resumes a paused one; idle does nothing. */
    fun toggle() {
        val player = controller ?: return
        if (!player.isConnected) return
        if (player.isPlaying) {
            player.pause()
        } else if (player.mediaItemCount > 0) {
            player.play()
        }
    }

    fun stop() {
        val player = controller
        _state.value = QuranPlayerSnapshot()
        if (player == null || !player.isConnected) return
        player.sendCustomCommand(
            SessionCommand(QuranPlaybackService.ACTION_STOP, Bundle.EMPTY),
            Bundle.EMPTY,
        )
    }

    /**
     * Reads what this device holds for [surah].
     *
     * The service writes the kept copies, but the store is a plain read of the
     * same directory: asking it here means a reader who never pressed play does
     * not start the service just to see the line.
     */
    fun refreshSaved(surah: Int, ayahCount: Int) {
        scope.launch {
            val saved =
                withContext(Dispatchers.IO) {
                    runCatching {
                            QuranAudioStore(File(appContext.filesDir, "quran-audio"), UrlQuranHttp())
                                .savedState(surah, ayahCount)
                        }
                        .getOrNull()
                } ?: return@launch
            val current = _state.value
            if (current.surah == null || current.surah == surah) {
                _state.value = current.copy(saved = saved)
            }
        }
    }

    /** Releases this client; the service keeps playing if it was playing. */
    fun release() {
        progress?.cancel()
        progress = null
        future?.let { pending ->
            if (!pending.isDone) pending.cancel(true)
        }
        future = null
        controller?.let { player ->
            player.removeListener(listener)
            player.release()
        }
        controller = null
        scope.cancel()
    }

    private fun withController(action: (MediaController) -> Unit) {
        val connected = controller
        if (connected != null && connected.isConnected) {
            action(connected)
            return
        }
        connect()
        val pending = future ?: return
        pending.addListener(
            {
                val player = runCatching { pending.get() }.getOrNull() ?: return@addListener
                action(player)
            },
            ContextCompat.getMainExecutor(appContext),
        )
    }

    private fun startProgress() {
        if (progress?.isActive == true) return
        progress =
            scope.launch {
                while (true) {
                    delay(PROGRESS_TICK_MS)
                    val player = controller ?: break
                    if (player.isPlaying) publish()
                }
            }
    }

    private fun publish() {
        val player = controller ?: return
        val item = player.currentMediaItem
        if (item == null || player.mediaItemCount == 0) {
            // A load in flight (or one that failed) has no items yet; keeping its
            // face is what stops the primary control flicking back to "listen"
            // before the service has answered.
            val pending =
                _state.value.status == QuranPlayerStatus.LOADING ||
                    _state.value.status == QuranPlayerStatus.OFFLINE ||
                    _state.value.status == QuranPlayerStatus.FAILED
            if (!pending) {
                _state.value = QuranPlayerSnapshot(saved = _state.value.saved)
            }
            return
        }
        val durationMs = player.duration
        _state.value =
            _state.value.copy(
                status = statusOf(player),
                surah = surahOf(item),
                name = nameOf(item),
                ayah = ayahOf(item),
                ayahCount = player.mediaItemCount,
                positionSeconds = maxOf(player.currentPosition, 0L) / 1000.0,
                durationSeconds = if (durationMs > 0) durationMs / 1000.0 else 0.0,
            )
    }

    private fun statusOf(player: MediaController): QuranPlayerStatus {
        val error = player.playerError
        if (error != null) return if (isNetworkFailure(error)) QuranPlayerStatus.OFFLINE else QuranPlayerStatus.FAILED
        if (player.isPlaying) return QuranPlayerStatus.PLAYING
        if (player.playbackState == Player.STATE_BUFFERING) return QuranPlayerStatus.LOADING
        if (player.playbackState == Player.STATE_ENDED) return QuranPlayerStatus.IDLE
        return QuranPlayerStatus.PAUSED
    }

    private fun isNetworkFailure(error: PlaybackException): Boolean =
        when (error.errorCode) {
            PlaybackException.ERROR_CODE_IO_NETWORK_CONNECTION_FAILED,
            PlaybackException.ERROR_CODE_IO_NETWORK_CONNECTION_TIMEOUT,
            PlaybackException.ERROR_CODE_IO_BAD_HTTP_STATUS,
            PlaybackException.ERROR_CODE_IO_UNSPECIFIED,
            -> true
            else -> false
        }

    private fun surahOf(item: androidx.media3.common.MediaItem): Int {
        val id = item.mediaId
        val colon = id.indexOf(':')
        if (colon <= 0) return 0
        return id.substring(0, colon).toIntOrNull() ?: 0
    }

    private fun ayahOf(item: androidx.media3.common.MediaItem): Int {
        val id = item.mediaId
        val colon = id.indexOf(':')
        if (colon < 0) return 1
        return id.substring(colon + 1).toIntOrNull() ?: 1
    }

    private fun nameOf(item: androidx.media3.common.MediaItem): String {
        val title = item.mediaMetadata.title?.toString().orEmpty()
        return if (title.startsWith(QuranPlaybackService.SURA_PREFIX)) {
            title.removePrefix(QuranPlaybackService.SURA_PREFIX)
        } else {
            title
        }
    }

    private companion object {
        const val PROGRESS_TICK_MS = 1000L
    }
}
