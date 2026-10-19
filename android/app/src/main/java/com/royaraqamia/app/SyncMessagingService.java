package com.royaraqamia.app;

import androidx.annotation.NonNull;

import com.capacitorjs.plugins.pushnotifications.PushNotificationsPlugin;
import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;

/**
 * The shell's FCM entry point (ADR-0059, ADR-0060).
 *
 * `@capacitor/push-notifications` ships its own `FirebaseMessagingService`, and
 * Firebase delivers `MESSAGING_EVENT` to exactly one of them — a manifest cannot
 * have two. So this build removes the plugin's (see `AndroidManifest.xml`) and
 * does both jobs here: the plugin's, delegated to its own static entry points,
 * and the drain's.
 *
 * A wake is silent by construction: the server sends no `notification` block, so
 * the system hands the message here instead of drawing anything, and all this
 * does with it is ask WorkManager for a drain. Whether the app is open,
 * backgrounded or closed makes no difference — FCM starts the process to deliver
 * it, and the drain then runs the one implementation of the queue.
 *
 * What a wake is *not* is a reason to trust anything. It carries no state and
 * cannot write: the worker pulls when it runs, and that pull is the same
 * last-write-wins reconciliation a focus event runs.
 */
public class SyncMessagingService extends FirebaseMessagingService {

    @Override
    public void onMessageReceived(@NonNull RemoteMessage message) {
        super.onMessageReceived(message);

        if (ShellSyncWake.isWake(message.getData())) {
            // A wake means the account moved on another device, which is both a
            // reason to replay what this device owes and to pull what it lacks;
            // the worker's page does one and then the other.
            SyncScheduler.flushSoon(this);
        }

        // The plugin's half, kept intact: a visible notification's data for the
        // page (a tap's URL), and the plugin's own hold-and-deliver for a build
        // whose bridge does not exist yet.
        PushNotificationsPlugin.sendRemoteMessage(message);
    }

    @Override
    public void onNewToken(@NonNull String token) {
        super.onNewToken(token);
        PushNotificationsPlugin.onNewToken(token);
    }
}
