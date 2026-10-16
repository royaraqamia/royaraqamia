package com.royaraqamia.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.fail;

import java.io.File;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import org.json.JSONArray;
import org.json.JSONException;
import org.junit.Test;

/**
 * The withheld-plugin rule (ADR-0050), on the JVM.
 *
 * The important assertion is the first one: `ShellPlugins.PUSH_NOTIFICATIONS_CLASS` is a
 * class name written by hand, while the class Capacitor actually registers comes from
 * `android/app/src/main/assets/capacitor.plugins.json` — which `cap sync` rewrites on a
 * plugin bump. If those two ever disagree the guard silently stops guarding, and the
 * failure would only appear as a crash on someone's phone.
 */
public class ShellPluginsTest {

    @Test
    public void theWithheldClassIsTheOneTheShellActuallyRegisters() throws IOException, JSONException {
        JSONArray plugins = new JSONArray(readPluginList());
        int found = 0;

        for (int i = 0; i < plugins.length(); i++) {
            String classPath = plugins.getJSONObject(i).getString("classpath");
            if (ShellPlugins.PUSH_NOTIFICATIONS_CLASS.equals(classPath)) {
                found++;
            }
        }

        assertEquals(
            "capacitor.plugins.json no longer names " + ShellPlugins.PUSH_NOTIFICATIONS_CLASS
                + ", so a build without Firebase would register the push plugin anyway",
            1,
            found
        );
    }

    @Test
    public void onlyThePushPluginIsWithheld() throws IOException, JSONException {
        JSONArray plugins = new JSONArray(readPluginList());
        int withheld = 0;

        for (int i = 0; i < plugins.length(); i++) {
            if (ShellPlugins.isWithheld(plugins.getJSONObject(i).getString("classpath"))) {
                withheld++;
            }
        }

        // Every other plugin in the list is one the shell means to serve, on every build.
        assertEquals(1, withheld);
        assertTrue(ShellPlugins.isWithheld(ShellPlugins.PUSH_NOTIFICATIONS_CLASS));
        assertFalse(ShellPlugins.isWithheld("com.capacitorjs.plugins.app.AppPlugin"));
        assertFalse(ShellPlugins.isWithheld(""));
    }

    /** `cap sync` writes it beside the shell's other assets, and the JVM tests run in `android/app`. */
    private static String readPluginList() throws IOException {
        String[] candidates = {
            "src/main/assets/capacitor.plugins.json",
            "app/src/main/assets/capacitor.plugins.json",
            "android/app/src/main/assets/capacitor.plugins.json",
        };

        for (String candidate : candidates) {
            File file = new File(candidate);
            if (file.exists()) {
                return new String(Files.readAllBytes(file.toPath()), StandardCharsets.UTF_8);
            }
        }

        fail("capacitor.plugins.json not found; the JVM tests expect to run from android/app "
            + "(cwd " + new File(".").getAbsolutePath() + ")");
        return "";
    }
}
