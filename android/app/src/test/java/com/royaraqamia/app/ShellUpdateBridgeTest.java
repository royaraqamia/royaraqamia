package com.royaraqamia.app;

import static org.junit.Assert.assertEquals;

import org.junit.Test;

/**
 * The page's update bridge (#503). It carries one number and nothing else: the
 * floor the server refused an owned API with, handed to the native card.
 */
public class ShellUpdateBridgeTest {

    @Test
    public void thePageAndTheShellSpellTheInterfaceTheSameWay() {
        // `frontend/shared/shell-update.ts` reads this global by name.
        assertEquals("RoyShellUpdate", ShellUpdateBridge.NAME);
    }

    @Test
    public void theServerFloorReachesTheNativeCard() {
        int[] received = {0};
        ShellUpdateBridge bridge = new ShellUpdateBridge(code -> received[0] = code);

        bridge.required(20042);

        assertEquals(20042, received[0]);
    }
}
