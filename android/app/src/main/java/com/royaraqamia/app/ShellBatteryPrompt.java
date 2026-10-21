package com.royaraqamia.app;

import android.app.ActivityManager;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Build;
import android.os.PowerManager;
import android.provider.Settings;
import android.util.Log;

import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;

/**
 * The battery-optimization exemption, asked where it matters (ADR-0059's
 * amendment, #381).
 *
 * Doze defers both halves of the background path — the FCM wake and the
 * `CONNECTED` WorkManager drain — so an app whose delivery the user is counting
 * on can fall behind with no voice in the shell saying so. The ADR promised the
 * request at the moment background delivery has something to deliver, with the
 * reason stated; this class is what honours that, and the two moments it
 * follows are already the system's own:
 *
 * - `SyncFlushWorker` calls {@link #promptIfNeeded} after a drain whose report
 *   says work is still owed (`SyncFlushResult.retry` — the give-up after
 *   `MAX_ATTEMPTS` included),
 * - `SyncMessagingService` calls it when a wake arrives while the app is not
 *   foregrounded.
 *
 * Neither runs where a dialog can be drawn, so the ask is a notification whose
 * copy states the reason, and the tap opens the platform's one-tap dialog
 * (`ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS`). Cold starts ask nothing: a
 * launch is the one moment the page itself is reporting what is owed.
 *
 * The one-shot flag lives in `SharedPreferences`, not the exemption status
 * itself: the system persists the grant, so this record only says the question
 * has been asked and an answer — granted or declined — is the user's, not
 * something to argue with on every drain.
 */
public final class ShellBatteryPrompt {

    private static final String TAG = "RoyBatteryPrompt";
    /** The channel the prompt posts on, and what later delivery notices use. */
    static final String CHANNEL_ID = "delivery";
    /** One stable notification id: re-posting replaces intent, never stacks. */
    static final int NOTIFICATION_ID = 41;
    /** Where the one-shot "asked" bit lives. */
    static final String PREFS = "royaraqamia_shell";
    static final String ASKED_KEY = "battery_exemption_asked";

    private ShellBatteryPrompt() {}

    /**
     * The decision, pure so the JVM tests hold it.
     *
     * Every clause names the condition that drops out of the ask:
     *
     * - already exempt — `PowerManager.isIgnoringBatteryOptimizations` reads the
     *   grant back, so a granted device is ever after quiet;
     * - asked before — a decline is an answer, and re-asking would argue with it;
     * - the app foregrounded — an open shell has the page reporting what is owed
     *   (the pill), and a notification under the user's thumb is noise;
     * - notifications not enabled — posting would silently no-op, and the one
     *   "asked" bit must not be spent on a question nobody saw.
     */
    static boolean shouldAsk(
            boolean alreadyExempt, boolean askedBefore, boolean foregrounded, boolean notificationsEnabled) {
        return !alreadyExempt && !askedBefore && !foregrounded && notificationsEnabled;
    }

    /** Reads the grant back the way the system stores it. */
    static boolean isExempt(Context context) {
        PowerManager power = context.getSystemService(PowerManager.class);
        return power != null && power.isIgnoringBatteryOptimizations(context.getPackageName());
    }

    /**
     * The ask, fenced by {@link #shouldAsk}. The "asked" bit is written after
     * the notification is handed over, and the only way the handover silently
     * drops — notifications disabled — is fenced above, because a question
     * nobody saw would otherwise be spent for good; the switch is app-wide, and
     * a next moment re-asks an app that has it back on.
     */
    public static void promptIfNeeded(Context context) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        boolean exempt = isExempt(context);
        boolean asked = prefs.getBoolean(ASKED_KEY, false);
        boolean foregrounded = foregrounded(context);
        boolean notificationsEnabled = NotificationManagerCompat.from(context).areNotificationsEnabled();

        if (!shouldAsk(exempt, asked, foregrounded, notificationsEnabled)) {
            Log.i(TAG, "no ask: exempt=" + exempt
                    + " asked=" + asked
                    + " foregrounded=" + foregrounded
                    + " notifications=" + notificationsEnabled);
            return;
        }

        ensureChannel(context);

        // The reason travels in the copy; the dialog is the platform's own, and
        // it re-states the app behind the `package:` data so the question it
        // renders is the same one the notification asked.
        Intent dialog = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS)
                .setData(Uri.parse("package:" + context.getPackageName()))
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        PendingIntent pending = PendingIntent.getActivity(
                context,
                0,
                dialog,
                PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);

        NotificationCompat.BigTextStyle body = new NotificationCompat.BigTextStyle()
                .bigText(context.getString(R.string.battery_prompt_message));
        NotificationCompat.Builder builder = new NotificationCompat.Builder(context, CHANNEL_ID)
                .setSmallIcon(R.mipmap.ic_launcher)
                .setColor(ContextCompat.getColor(context, R.color.roy_primary))
                .setContentTitle(context.getString(R.string.battery_prompt_title))
                .setContentText(context.getString(R.string.battery_prompt_message))
                .setStyle(body)
                .setContentIntent(pending)
                // The dialog, once taken, is the only surface left to use; the
                // notification has done its work the moment it is read.
                .setAutoCancel(true);

        // `notify` answers void; the slow-failure case is `areNotificationsEnabled`,
        // checked above, because a notification Android would silently drop must
        // not spend the one ask — an app-wide switch, not a per-notification one.
        NotificationManagerCompat.from(context).notify(NOTIFICATION_ID, builder.build());
        prefs.edit().putBoolean(ASKED_KEY, true).apply();
        Log.i(TAG, "asked: the exemption notification is up");
    }

    /**
     * The process's own visibility, read the one way that works from anywhere:
     * `getMyMemoryState` into this process (an activity list query from a
     * background context missed here). At most `IMPORTANCE_FOREGROUND` means the
     * app's task is what the user is looking at.
     */
    private static boolean foregrounded(Context context) {
        ActivityManager.RunningAppProcessInfo info = new ActivityManager.RunningAppProcessInfo();
        ActivityManager.getMyMemoryState(info);
        return info.importance <= ActivityManager.RunningAppProcessInfo.IMPORTANCE_FOREGROUND;
    }

    /** Delivery keeps one channel; `getNotificationChannel` idempotence is the guard. */
    private static void ensureChannel(Context context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        if (manager == null || manager.getNotificationChannel(CHANNEL_ID) != null) return;
        NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID,
                context.getString(R.string.battery_channel_name),
                NotificationManager.IMPORTANCE_DEFAULT);
        channel.setDescription(context.getString(R.string.battery_channel_description));
        manager.createNotificationChannel(channel);
    }
}
