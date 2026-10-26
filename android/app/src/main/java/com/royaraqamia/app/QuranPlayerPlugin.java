package com.royaraqamia.app;

import android.content.ComponentName;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import androidx.core.content.ContextCompat;
import androidx.media3.common.MediaItem;
import androidx.media3.common.PlaybackException;
import androidx.media3.common.Player;
import androidx.media3.session.MediaController;
import androidx.media3.session.SessionCommand;
import androidx.media3.session.SessionResult;
import androidx.media3.session.SessionToken;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.common.util.concurrent.ListenableFuture;
import java.io.File;
import org.json.JSONObject;

/**
 * The page's handle on the native recitation (ADR-0086).
 *
 * Every call goes through a media3 {@link MediaController}, which is the
 * platform's way of talking to a {@link QuranPlaybackService} and of keeping it
 * alive with a notification: play, pause, seek and the two track skips are the
 * session's own commands; loading a sura, keeping it and reading the keep's
 * progress are this app's custom ones.
 *
 * State flows the other way as a `state` event shaped exactly like the web
 * engine's, so the float and the mini player do not know which engine is
 * playing. A frozen WebView misses events; `state()` is the resync the page
 * calls when it comes back.
 */
@CapacitorPlugin(name = "QuranPlayer")
public class QuranPlayerPlugin extends Plugin {

    private static final String EVENT_STATE = "state";
    private static final String DEFAULT_ORIGIN = "https://royaraqamia.com";

    private Handler main;
    private MediaController controller;
    private ListenableFuture<MediaController> controllerFuture;
    private boolean ticking;

    private final Player.Listener playerListener = new Player.Listener() {
        @Override
        public void onEvents(Player player, Player.Events events) {
            emitState();
        }
    };

    private final Runnable ticker = new Runnable() {
        @Override
        public void run() {
            try {
                if (controller != null && controller.isConnected() && controller.isPlaying()) {
                    emitState();
                }
            } catch (Exception ignored) {
                // A controller released under the ticker is the next tick's
                // problem; the page still has `state()`.
            }
            if (ticking) main.postDelayed(this, 1000);
        }
    };

    @Override
    public void load() {
        main = new Handler(Looper.getMainLooper());
    }

    @PluginMethod
    public void loadSurah(PluginCall call) {
        int surah = intValue(call.getInt("surah"), 1);
        int ayah = intValue(call.getInt("ayah"), 1);
        double offset = doubleValue(call.getDouble("offset"), 0);
        String origin = call.getString("origin", DEFAULT_ORIGIN);

        withController(call, (player, caller) -> {
            Bundle args = new Bundle();
            args.putInt("surah", surah);
            args.putInt("ayah", ayah);
            args.putDouble("offset", Math.max(offset, 0));
            args.putString("origin", origin);

            ListenableFuture<SessionResult> result = player.sendCustomCommand(
                command(QuranPlaybackService.ACTION_LOAD),
                args
            );
            result.addListener(
                () -> {
                    try {
                        if (result.get().resultCode == SessionResult.RESULT_SUCCESS) caller.resolve();
                        else caller.reject("the sura could not be loaded");
                    } catch (Exception failure) {
                        caller.reject("the sura could not be loaded");
                    }
                },
                ContextCompat.getMainExecutor(getContext())
            );
        });
    }

    @PluginMethod
    public void play(PluginCall call) {
        withController(call, (player, caller) -> {
            player.play();
            caller.resolve();
        });
    }

    @PluginMethod
    public void pause(PluginCall call) {
        withController(call, (player, caller) -> {
            player.pause();
            caller.resolve();
        });
    }

    @PluginMethod
    public void next(PluginCall call) {
        withController(call, (player, caller) -> {
            // The service answers the end of a sura in `onPlayerCommandRequest`,
            // so the notification's next and this one take the same path.
            player.seekToNextMediaItem();
            caller.resolve();
        });
    }

    @PluginMethod
    public void previous(PluginCall call) {
        withController(call, (player, caller) -> {
            if (player.getCurrentPosition() > 3000) player.seekTo(0);
            else if (player.hasPreviousMediaItem()) player.seekToPreviousMediaItem();
            else player.seekTo(0);
            caller.resolve();
        });
    }

    @PluginMethod
    public void seekTo(PluginCall call) {
        double seconds = doubleValue(call.getDouble("seconds"), 0);
        withController(call, (player, caller) -> {
            player.seekTo((long) (Math.max(seconds, 0) * 1000));
            caller.resolve();
        });
    }

    @PluginMethod
    public void seekBy(PluginCall call) {
        double seconds = doubleValue(call.getDouble("seconds"), 0);
        withController(call, (player, caller) -> {
            long target = player.getCurrentPosition() + (long) (seconds * 1000);
            player.seekTo(Math.max(target, 0));
            caller.resolve();
        });
    }

    @PluginMethod
    public void stop(PluginCall call) {
        withController(call, (player, caller) -> {
            ListenableFuture<SessionResult> result = player.sendCustomCommand(
                command(QuranPlaybackService.ACTION_STOP),
                Bundle.EMPTY
            );
            result.addListener(
                () -> {
                    try {
                        result.get();
                    } catch (Exception ignored) {
                        // The service is gone either way; the page wanted it stopped.
                    }
                    // `stop` ends the service, so the controller is dead weight;
                    // keeping it would make the next play talk to a released
                    // player until the bridge was rebuilt.
                    releaseController();
                    caller.resolve();
                },
                ContextCompat.getMainExecutor(getContext())
            );
        });
    }

    @PluginMethod
    public void state(PluginCall call) {
        if (controller == null || !controller.isConnected()) {
            if (controller != null) releaseController();
            call.resolve(stateFromPreferences());
            // A service that is still playing after the activity was recreated
            // has no controller yet. Connecting to it turns the saved record
            // into the live state on the next event; without this the page
            // would show a paused sura and a play press would restart it.
            if (QuranPrefs.last(getContext()).has("surah")) ensureController();
            return;
        }
        main.post(() -> call.resolve(buildState(controller)));
    }

    @PluginMethod
    public void saved(PluginCall call) {
        int surah = intValue(call.getInt("surah"), 0);
        int ayahCount = intValue(call.getInt("ayahCount"), 0);
        JSObject result = new JSObject();
        result.put("state", store().savedState(surah, ayahCount));
        call.resolve(result);
    }

    @PluginMethod
    public void keep(PluginCall call) {
        int surah = intValue(call.getInt("surah"), 0);
        String origin = call.getString("origin", DEFAULT_ORIGIN);
        withController(call, (player, caller) -> {
            Bundle args = new Bundle();
            args.putInt("surah", surah);
            args.putString("origin", origin);
            player.sendCustomCommand(command(QuranPlaybackService.ACTION_KEEP), args);
            caller.resolve();
        });
    }

    @PluginMethod
    public void keepState(PluginCall call) {
        int surah = intValue(call.getInt("surah"), 0);
        withController(call, (player, caller) -> {
            Bundle args = new Bundle();
            args.putInt("surah", surah);
            ListenableFuture<SessionResult> result = player.sendCustomCommand(
                command(QuranPlaybackService.ACTION_KEEP_STATE),
                args
            );
            result.addListener(
                () -> {
                    try {
                        SessionResult answer = result.get();
                        JSObject state = new JSObject();
                        Bundle extras = answer.extras;
                        if (extras != null) {
                            state.put("phase", extras.getString("phase", "idle"));
                            state.put("done", extras.getInt("done", 0));
                            state.put("total", extras.getInt("total", 0));
                        }
                        caller.resolve(state);
                    } catch (Exception failure) {
                        caller.reject("the keep state could not be read");
                    }
                },
                ContextCompat.getMainExecutor(getContext())
            );
        });
    }

    @Override
    protected void handleOnDestroy() {
        ticking = false;
        if (main != null) main.removeCallbacks(ticker);
        if (controllerFuture != null && !controllerFuture.isDone()) {
            controllerFuture.cancel(true);
        }
        releaseController();
        super.handleOnDestroy();
    }

    private void releaseController() {
        if (controller != null) {
            controller.removeListener(playerListener);
            controller.release();
            controller = null;
        }
        controllerFuture = null;
    }

    private void withController(PluginCall call, WithController action) {
        if (controller != null && controller.isConnected()) {
            MediaController current = controller;
            main.post(() -> action.run(current, call));
            return;
        }
        if (controller != null) releaseController();

        ensureController();
        controllerFuture.addListener(
            () -> {
                try {
                    MediaController player = controllerFuture.get();
                    action.run(player, call);
                } catch (Exception failure) {
                    call.reject("the recitation player is not available");
                }
            },
            ContextCompat.getMainExecutor(getContext())
        );
    }

    private void ensureController() {
        if (controllerFuture != null) return;

        SessionToken token = new SessionToken(
            getContext(),
            new ComponentName(getContext(), QuranPlaybackService.class)
        );
        controllerFuture = new MediaController.Builder(getContext(), token).buildAsync();
        controllerFuture.addListener(
            () -> {
                try {
                    controller = controllerFuture.get();
                    controller.addListener(playerListener);
                    startTicker();
                    emitState();
                } catch (Exception ignored) {
                    // Every method rejects on its own; the next call retries.
                    controllerFuture = null;
                }
            },
            ContextCompat.getMainExecutor(getContext())
        );
    }

    private void startTicker() {
        if (ticking || main == null) return;
        ticking = true;
        main.postDelayed(ticker, 1000);
    }

    private void emitState() {
        if (controller == null) return;
        notifyListeners(EVENT_STATE, buildState(controller));
    }

    private JSObject buildState(MediaController player) {
        MediaItem item = player.getCurrentMediaItem();
        int count = player.getMediaItemCount();
        if (item == null || count == 0) return stateFromPreferences();

        JSObject state = new JSObject();
        state.put("status", statusOf(player));
        state.put("surah", surahOf(item));
        state.put("name", nameOf(item));
        state.put("ayahCount", count);
        state.put("ayah", ayahOf(item));
        double position = Math.max(player.getCurrentPosition(), 0) / 1000.0;
        long duration = player.getDuration();
        double seconds = duration > 0 ? duration / 1000.0 : 0;
        state.put("position", position);
        state.put("duration", seconds);
        state.put("surahPosition", position);
        state.put("surahDuration", seconds);
        state.put("source", "device".equals(sourceOf(item)) ? "device" : "host");
        state.put("loaded", true);
        return state;
    }

    private JSObject stateFromPreferences() {
        JSObject state = new JSObject();
        JSONObject last = QuranPrefs.last(getContext());

        if (!last.has("surah")) {
            state.put("status", "idle");
            state.put("surah", JSONObject.NULL);
            state.put("name", JSONObject.NULL);
            state.put("ayahCount", 0);
            state.put("ayah", 1);
            state.put("position", 0);
            state.put("duration", 0);
            state.put("surahPosition", 0);
            state.put("surahDuration", 0);
            state.put("source", JSONObject.NULL);
            state.put("loaded", false);
            return state;
        }

        state.put("status", "paused");
        state.put("surah", last.optInt("surah", 1));
        state.put("name", last.optString("name", ""));
        state.put("ayahCount", last.optInt("ayahCount", 0));
        state.put("ayah", Math.max(last.optInt("ayah", 1), 1));
        double offset = Math.max(last.optDouble("offset", 0), 0);
        state.put("position", offset);
        state.put("duration", 0);
        state.put("surahPosition", offset);
        state.put("surahDuration", 0);
        state.put("source", JSONObject.NULL);
        state.put("loaded", false);
        return state;
    }

    private String statusOf(MediaController player) {
        PlaybackException error = player.getPlayerError();
        if (error != null) return isNetworkFailure(error) ? "offline" : "error";
        if (player.isPlaying()) return "playing";
        if (player.getPlaybackState() == Player.STATE_BUFFERING) return "loading";
        if (player.getPlaybackState() == Player.STATE_ENDED) return "idle";
        return "paused";
    }

    private static boolean isNetworkFailure(PlaybackException error) {
        int code = error.errorCode;
        return (
            code == PlaybackException.ERROR_CODE_IO_NETWORK_CONNECTION_FAILED ||
            code == PlaybackException.ERROR_CODE_IO_NETWORK_CONNECTION_TIMEOUT ||
            code == PlaybackException.ERROR_CODE_IO_BAD_HTTP_STATUS ||
            code == PlaybackException.ERROR_CODE_IO_UNSPECIFIED
        );
    }

    private static int surahOf(MediaItem item) {
        String id = item.mediaId;
        int colon = id.indexOf(':');
        if (colon <= 0) return 0;
        try {
            return Integer.parseInt(id.substring(0, colon));
        } catch (NumberFormatException ignored) {
            return 0;
        }
    }

    private static int ayahOf(MediaItem item) {
        String id = item.mediaId;
        int colon = id.indexOf(':');
        if (colon < 0) return 1;
        try {
            return Integer.parseInt(id.substring(colon + 1));
        } catch (NumberFormatException ignored) {
            return 1;
        }
    }

    private static String nameOf(MediaItem item) {
        CharSequence title = item.mediaMetadata.title;
        if (title == null) return "";
        String value = title.toString();
        return value.startsWith(QuranPlaybackService.SURA_PREFIX)
            ? value.substring(QuranPlaybackService.SURA_PREFIX.length())
            : value;
    }

    private static String sourceOf(MediaItem item) {
        Uri uri = item.localConfiguration != null ? item.localConfiguration.uri : null;
        String scheme = uri != null ? uri.getScheme() : null;
        return "file".equals(scheme) ? "device" : "host";
    }

    private QuranAudioStore store() {
        return new QuranAudioStore(
            new File(getContext().getFilesDir(), "quran-audio"),
            new UrlQuranHttp()
        );
    }

    private static SessionCommand command(String action) {
        return new SessionCommand(action, Bundle.EMPTY);
    }

    private static int intValue(Integer value, int fallback) {
        return value == null ? fallback : value;
    }

    private static double doubleValue(Double value, double fallback) {
        return value == null ? fallback : value;
    }

    private interface WithController {
        void run(MediaController player, PluginCall call);
    }
}
