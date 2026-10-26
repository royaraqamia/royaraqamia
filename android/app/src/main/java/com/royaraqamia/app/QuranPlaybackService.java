package com.royaraqamia.app;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Intent;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import androidx.annotation.Nullable;
import androidx.media3.common.AudioAttributes;
import androidx.media3.common.C;
import androidx.media3.common.MediaItem;
import androidx.media3.common.MediaMetadata;
import androidx.media3.common.Player;
import androidx.media3.datasource.DataSourceBitmapLoader;
import androidx.media3.exoplayer.ExoPlayer;
import androidx.media3.session.CacheBitmapLoader;
import androidx.media3.session.DefaultMediaNotificationProvider;
import androidx.media3.session.MediaSession;
import androidx.media3.session.MediaSessionService;
import androidx.media3.session.SessionCommand;
import androidx.media3.session.SessionCommands;
import androidx.media3.session.SessionResult;
import com.google.common.util.concurrent.Futures;
import com.google.common.util.concurrent.ListenableFuture;
import com.google.common.util.concurrent.SettableFuture;
import java.io.File;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * The recitation, played by Android rather than by the WebView.
 *
 * A foreground {@link MediaSessionService} with an ExoPlayer and a Media
 * Session: the screen can go off, the app can be swiped away, and the queue
 * keeps advancing because it is not JavaScript that advances it. The system
 * draws the notification from the session, so Play/Pause, Stop, previous/next
 * and the seek bar are the platform's own controls.
 *
 * The page is a controller: it sends a sura to load, receives state, and paints
 * the same float and mini player the web engine paints. The service owns the
 * bookkeeping the page cannot do while frozen: the next sura's manifest, the
 * kept copies and the last position.
 */
public class QuranPlaybackService extends MediaSessionService {

    static final String ACTION_LOAD = "com.royaraqamia.app.QURAN_LOAD";
    static final String ACTION_KEEP = "com.royaraqamia.app.QURAN_KEEP";
    static final String ACTION_KEEP_STATE = "com.royaraqamia.app.QURAN_KEEP_STATE";
    static final String ACTION_SAVED = "com.royaraqamia.app.QURAN_SAVED";
    static final String ACTION_STOP = "com.royaraqamia.app.QURAN_STOP";
    static final String SURA_PREFIX = "سورة ";

    private static final String CHANNEL_ID = "quran_playback";
    private static final long PERSIST_INTERVAL_MS = 5000;
    private static final String[] CUSTOM_ACTIONS = {
        ACTION_LOAD,
        ACTION_KEEP,
        ACTION_KEEP_STATE,
        ACTION_SAVED,
        ACTION_STOP,
    };

    private ExoPlayer player;
    private MediaSession session;
    private ExecutorService io;
    private ExecutorService keepIo;
    private Handler main;
    private QuranAudioStore store;
    private QuranManifestRepository manifests;

    private SurahQueue queue;
    private SurahQueue nextQueue;
    private QuranManifest pendingKeep;
    private volatile String origin = "https://royaraqamia.com";
    private volatile KeepState keep = KeepState.idle();

    private final Runnable persistTicker = new Runnable() {
        @Override
        public void run() {
            if (player != null && player.isPlaying()) persist();
            main.postDelayed(this, PERSIST_INTERVAL_MS);
        }
    };

    @Override
    public void onCreate() {
        super.onCreate();
        io = Executors.newSingleThreadExecutor();
        keepIo = Executors.newSingleThreadExecutor();
        main = new Handler(Looper.getMainLooper());
        store = new QuranAudioStore(new File(getFilesDir(), "quran-audio"), new UrlQuranHttp());
        manifests =
            new QuranManifestRepository(new File(getFilesDir(), "quran-manifests"), new UrlQuranHttp());

        AudioAttributes attributes = new AudioAttributes.Builder()
            .setUsage(C.USAGE_MEDIA)
            .setContentType(C.AUDIO_CONTENT_TYPE_SPEECH)
            .build();

        player = new ExoPlayer.Builder(this)
            .setAudioAttributes(attributes, true)
            .setHandleAudioBecomingNoisy(true)
            .build();
        // The screen goes off; the CPU and the network must not.
        player.setWakeMode(C.WAKE_MODE_NETWORK);
        player.addListener(playerListener);

        session =
            new MediaSession.Builder(this, player)
                .setCallback(sessionCallback)
                .setSessionActivity(openAppIntent())
                .setBitmapLoader(new CacheBitmapLoader(new DataSourceBitmapLoader(this)))
                .build();

        createChannel();
        setMediaNotificationProvider(
            new DefaultMediaNotificationProvider.Builder(this)
                .setChannelId(CHANNEL_ID)
                .setChannelName(R.string.quran_channel_name)
                .setNotificationId(7311)
                .build()
        );

        main.postDelayed(persistTicker, PERSIST_INTERVAL_MS);
    }

    @Override
    public MediaSession onGetSession(MediaSession.ControllerInfo controllerInfo) {
        return session;
    }

    /**
     * A swipe away is not a stop. While the recitation is playing the service is
     * foreground and the notification is the way to end it; only a task removed
     * while idle ends the service.
     */
    @Override
    public void onTaskRemoved(@Nullable Intent rootIntent) {
        if (player != null && player.isPlaying()) return;
        stopSelf();
    }

    @Override
    public void onDestroy() {
        main.removeCallbacksAndMessages(null);
        if (session != null) session.release();
        if (player != null) player.release();
        if (io != null) io.shutdownNow();
        if (keepIo != null) keepIo.shutdownNow();
        super.onDestroy();
    }

    private final Player.Listener playerListener = new Player.Listener() {
        @Override
        public void onMediaItemTransition(@Nullable MediaItem mediaItem, int reason) {
            if (queue == null || mediaItem == null) return;
            persist();
            int ayah = ayahOf(mediaItem);
            if (ayah >= 1 && ayah <= queue.manifest.files.size()) {
                // Reading an Ayah is an LRU use; the index write is not something
                // to do on the thread that is drawing the notification.
                QuranManifest.AyahFile file = queue.manifest.files.get(ayah - 1);
                int surah = queue.manifest.surah;
                io.execute(() -> store.touch(surah, file));
            }
        }

        @Override
        public void onPlaybackStateChanged(int state) {
            if (state == Player.STATE_ENDED) {
                // The last Ayah of a sura is not the end of the recitation.
                nextSurah();
            }
        }

        @Override
        public void onIsPlayingChanged(boolean isPlaying) {
            if (isPlaying) persist();
        }
    };

    private final MediaSession.Callback sessionCallback = new MediaSession.Callback() {
        /**
         * The custom commands are not part of the platform's set, so a
         * controller that was not told about them would be refused. They are
         * added here, per connection, because they carry this app's own
         * operations and nothing standard.
         */
        @Override
        public MediaSession.ConnectionResult onConnect(
            MediaSession session,
            MediaSession.ControllerInfo controller
        ) {
            MediaSession.ConnectionResult accepted = MediaSession.Callback.super.onConnect(
                session,
                controller
            );
            SessionCommands.Builder commands = accepted.availableSessionCommands.buildUpon();
            for (String action : CUSTOM_ACTIONS) {
                commands.add(new SessionCommand(action, Bundle.EMPTY));
            }
            return new MediaSession.ConnectionResult.AcceptedResultBuilder(session)
                .setAvailableSessionCommands(commands.build())
                .setAvailablePlayerCommands(accepted.availablePlayerCommands)
                .build();
        }

        @Override
        public ListenableFuture<SessionResult> onCustomCommand(
            MediaSession session,
            MediaSession.ControllerInfo controller,
            SessionCommand customCommand,
            Bundle args
        ) {
            String action = customCommand.customAction;
            if (ACTION_LOAD.equals(action)) return load(args);
            if (ACTION_KEEP.equals(action)) return keep(args);
            if (ACTION_KEEP_STATE.equals(action)) return keepState(args);
            if (ACTION_SAVED.equals(action)) return saved(args);
            if (ACTION_STOP.equals(action)) {
                stopAndClear();
                return Futures.immediateFuture(new SessionResult(SessionResult.RESULT_SUCCESS));
            }
            return Futures.immediateFuture(
                new SessionResult(SessionResult.RESULT_ERROR_NOT_SUPPORTED)
            );
        }

        /**
         * The notification's next and the lock screen's stop are player commands,
         * not our custom ones, so the two boundaries the player cannot see are
         * answered here: the last Ayah of a sura, and a stop that also clears the
         * resume record.
         */
        @Override
        public int onPlayerCommandRequest(
            MediaSession session,
            MediaSession.ControllerInfo controller,
            int command
        ) {
            if (command == Player.COMMAND_STOP) {
                stopAndClear();
                return SessionResult.RESULT_SUCCESS;
            }
            if (
                command == Player.COMMAND_SEEK_TO_NEXT_MEDIA_ITEM &&
                player != null &&
                !player.hasNextMediaItem()
            ) {
                nextSurah();
                return SessionResult.RESULT_SUCCESS;
            }
            if (
                command == Player.COMMAND_SEEK_TO_PREVIOUS_MEDIA_ITEM &&
                player != null &&
                !player.hasPreviousMediaItem()
            ) {
                // The first Ayah's "previous" restarts it, as the page's does.
                player.seekTo(0);
                return SessionResult.RESULT_SUCCESS;
            }
            return MediaSession.Callback.super.onPlayerCommandRequest(
                session,
                controller,
                command
            );
        }
    };

    private ListenableFuture<SessionResult> load(Bundle args) {
        SettableFuture<SessionResult> result = SettableFuture.create();
        String requestedOrigin = args.getString("origin", origin);
        int surah = args.getInt("surah", 1);
        int ayah = Math.max(args.getInt("ayah", 1), 1);
        double offset = Math.max(args.getDouble("offset", 0), 0);
        origin = requestedOrigin;

        io.execute(() -> {
            try {
                QuranManifest manifest = manifests.load(requestedOrigin, surah);
                List<MediaItem> items = buildItems(manifest);
                main.post(() -> {
                    queue = new SurahQueue(manifest, items);
                    nextQueue = null;
                    int start = Math.min(ayah - 1, Math.max(items.size() - 1, 0));
                    player.setMediaItems(items, start, (long) (offset * 1000));
                    player.prepare();
                    player.play();
                    persist();
                    prefetchNext();
                    maybeKeep(manifest);
                    result.set(new SessionResult(SessionResult.RESULT_SUCCESS));
                });
            } catch (Exception failure) {
                result.set(new SessionResult(SessionResult.RESULT_ERROR_IO));
            }
        });
        return result;
    }

    private ListenableFuture<SessionResult> keep(Bundle args) {
        int surah = args.getInt("surah", 0);
        String requestedOrigin = args.getString("origin", origin);
        io.execute(() -> {
            try {
                QuranManifest manifest =
                    queue != null && queue.manifest.surah == surah
                        ? queue.manifest
                        : manifests.load(requestedOrigin, surah);
                main.post(() -> maybeKeep(manifest));
            } catch (Exception ignored) {
                // A keep that cannot read its manifest is a keep the reader
                // starts again on the next play; nothing is playing from it.
            }
        });
        return Futures.immediateFuture(new SessionResult(SessionResult.RESULT_SUCCESS));
    }

    private ListenableFuture<SessionResult> keepState(Bundle args) {
        int surah = args.getInt("surah", 0);
        KeepState current = keep;
        Bundle result = new Bundle();
        boolean same = current.surah == surah;
        result.putString("phase", same ? current.phase : "idle");
        result.putInt("done", same ? current.done : 0);
        result.putInt("total", same ? current.total : 0);
        return Futures.immediateFuture(new SessionResult(SessionResult.RESULT_SUCCESS, result));
    }

    private ListenableFuture<SessionResult> saved(Bundle args) {
        int surah = args.getInt("surah", 0);
        int ayahCount = args.getInt("ayahCount", 0);
        Bundle result = new Bundle();
        result.putString("state", store.savedState(surah, ayahCount));
        return Futures.immediateFuture(new SessionResult(SessionResult.RESULT_SUCCESS, result));
    }

    private void nextSurah() {
        if (queue == null) return;
        if (nextQueue != null) {
            adopt(nextQueue);
            return;
        }

        int surah = queue.manifest.surah + 1;
        if (surah > QuranManifest.LAST_SURAH) {
            stopAndClear();
            return;
        }

        io.execute(() -> {
            try {
                QuranManifest manifest = manifests.load(origin, surah);
                List<MediaItem> items = buildItems(manifest);
                main.post(() -> {
                    if (queue != null && queue.manifest.surah + 1 == surah) {
                        adopt(new SurahQueue(manifest, items));
                    }
                });
            } catch (Exception failure) {
                main.post(this::stopAndClear);
            }
        });
    }

    private void adopt(SurahQueue next) {
        queue = next;
        nextQueue = null;
        player.setMediaItems(next.items, 0, 0);
        player.prepare();
        player.play();
        persist();
        prefetchNext();
        maybeKeep(next.manifest);
    }

    private void prefetchNext() {
        if (queue == null) return;
        int surah = queue.manifest.surah + 1;
        if (surah > QuranManifest.LAST_SURAH) {
            nextQueue = null;
            return;
        }
        io.execute(() -> {
            try {
                QuranManifest manifest = manifests.load(origin, surah);
                List<MediaItem> items = buildItems(manifest);
                main.post(() -> {
                    if (queue != null && queue.manifest.surah + 1 == surah) {
                        nextQueue = new SurahQueue(manifest, items);
                    }
                });
            } catch (Exception ignored) {
                // The boundary will try again, and a failure there ends the
                // recitation rather than playing the wrong sura.
            }
        });
    }

    private List<MediaItem> buildItems(QuranManifest manifest) {
        String base = manifests.baseUrl();
        String reciter = manifests.reciter();
        Uri artwork = Uri.parse(origin + "/quran/audio/cover-512.png");
        List<MediaItem> items = new ArrayList<>(manifest.files.size());

        for (QuranManifest.AyahFile file : manifest.files) {
            File local = store.fileFor(manifest.surah, file);
            Uri uri = local != null ? Uri.fromFile(local) : Uri.parse(manifest.remoteUrl(base, file));
            MediaMetadata metadata = new MediaMetadata.Builder()
                .setTitle(SURA_PREFIX + manifest.name)
                .setArtist(
                    String.format(
                        Locale.ROOT,
                        "الآية %d من %d · %s",
                        file.ayah,
                        manifest.files.size(),
                        reciter
                    )
                )
                .setArtworkUri(artwork)
                .build();
            items.add(
                new MediaItem.Builder()
                    .setMediaId(manifest.surah + ":" + file.ayah)
                    .setUri(uri)
                    .setMediaMetadata(metadata)
                    .build()
            );
        }
        return items;
    }

    private void maybeKeep(QuranManifest manifest) {
        int total = manifest.files.size();
        if (store.savedState(manifest.surah, total).equals("complete")) return;
        if (keep.working()) {
            // One keep at a time. A sura asked for while another is still
            // downloading waits for it instead of competing for the network.
            if (keep.surah != manifest.surah) pendingKeep = manifest;
            return;
        }

        if (isMetered()) {
            keep = KeepState.metered(manifest.surah, total);
            return;
        }

        int surah = manifest.surah;
        keep = KeepState.working(surah, 0, total);
        // A keep is a long download; it must not stand between the player and
        // the next sura's manifest at the boundary.
        keepIo.execute(() -> {
            try {
                store.keep(
                    manifest,
                    manifests.baseUrl(),
                    (done, count) -> keep = KeepState.working(surah, done, count)
                );
                keep = KeepState.done(surah, total);
            } catch (Exception failure) {
                keep = KeepState.failed(surah, total);
            }
            main.post(() -> {
                QuranManifest queued = pendingKeep;
                pendingKeep = null;
                if (queued != null) maybeKeep(queued);
            });
        });
    }

    private void stopAndClear() {
        keep = KeepState.idle();
        pendingKeep = null;
        queue = null;
        nextQueue = null;
        if (player != null) {
            player.stop();
            player.clearMediaItems();
        }
        QuranPrefs.clearLast(this);
        stopSelf();
    }

    private void persist() {
        if (queue == null || player == null) return;
        MediaItem item = player.getCurrentMediaItem();
        if (item == null) return;
        int ayah = ayahOf(item);
        QuranPrefs.saveLast(
            this,
            queue.manifest.surah,
            queue.manifest.name,
            ayah,
            queue.items.size(),
            player.getCurrentPosition()
        );
    }

    private boolean isMetered() {
        ConnectivityManager manager = (ConnectivityManager) getSystemService(CONNECTIVITY_SERVICE);
        if (manager == null) return false;
        Network network = manager.getActiveNetwork();
        if (network == null) return false;
        NetworkCapabilities capabilities = manager.getNetworkCapabilities(network);
        return (
            capabilities != null &&
            !capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_NOT_METERED)
        );
    }

    private void createChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager manager = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        if (manager == null) return;
        NotificationChannel channel = new NotificationChannel(
            CHANNEL_ID,
            getString(R.string.quran_channel_name),
            NotificationManager.IMPORTANCE_LOW
        );
        channel.setDescription(getString(R.string.quran_channel_description));
        channel.setShowBadge(false);
        manager.createNotificationChannel(channel);
    }

    private PendingIntent openAppIntent() {
        Intent intent = new Intent(this, MainActivity.class).setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP);
        return PendingIntent.getActivity(
            this,
            0,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
    }

    private static int ayahOf(MediaItem item) {
        String id = item.mediaId;
        int colon = id.indexOf(':');
        if (colon < 0) return 0;
        try {
            return Integer.parseInt(id.substring(colon + 1));
        } catch (NumberFormatException ignored) {
            return 0;
        }
    }

    private static final class SurahQueue {

        final QuranManifest manifest;
        final List<MediaItem> items;

        SurahQueue(QuranManifest manifest, List<MediaItem> items) {
            this.manifest = manifest;
            this.items = items;
        }
    }

    static final class KeepState {

        final String phase;
        final int surah;
        final int done;
        final int total;

        private KeepState(String phase, int surah, int done, int total) {
            this.phase = phase;
            this.surah = surah;
            this.done = done;
            this.total = total;
        }

        static KeepState idle() {
            return new KeepState("idle", 0, 0, 0);
        }

        static KeepState working(int surah, int done, int total) {
            return new KeepState("working", surah, done, total);
        }

        static KeepState done(int surah, int total) {
            return new KeepState("done", surah, total, total);
        }

        static KeepState metered(int surah, int total) {
            return new KeepState("metered", surah, 0, total);
        }

        static KeepState failed(int surah, int total) {
            return new KeepState("failed", surah, 0, total);
        }

        boolean working() {
            return "working".equals(phase);
        }
    }
}
