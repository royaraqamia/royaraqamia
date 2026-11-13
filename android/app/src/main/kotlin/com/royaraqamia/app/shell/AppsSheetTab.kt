package com.royaraqamia.app.shell

/**
 * The three tabs of the apps sheet (#1256, ADR-0159).
 *
 * [Internal] is the picker the sheet has always drawn; [External] is the store
 * and [Inbound] the clients connected to our MCP server. The site draws all
 * three as panels on one surface (`frontend/ui/apps/apps-surface.tsx`), and the
 * sheet is the same surface — so the names are the parity row's states, and a
 * tab one client can draw and the other cannot is visible to `check:parity`
 * rather than to a member.
 *
 * Both MCP tabs are panels since #1256: [External] is `mcp/MarketplaceTab.kt`
 * and [Inbound] is `connectedapps/InboundTab.kt`, each receiving the surface's
 * one search term rather than opening a door.
 */
sealed interface AppsSheetTab {
    data object Internal : AppsSheetTab

    data object External : AppsSheetTab

    data object Inbound : AppsSheetTab
}
