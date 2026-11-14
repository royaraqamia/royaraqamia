/* global URL, fetch */
/**
 * Keeps the free Render origin warm through the app's active hours.
 *
 * Render spins a Free web service down after 15 minutes without inbound
 * traffic, and the next visitor waits about a minute while it starts. A cron
 * trigger is the free way to make that a morning problem instead of an
 * every-hour one: this Worker requests a static file — traffic, but almost no
 * CPU — every five minutes from 05:00 to 20:55 UTC (08:00 to 23:55 in Baghdad).
 *
 * Sixteen hours a day is ~480 of the 750 Free instance hours a month, leaving
 * ~270 for `downloader-host`. If that service starts running long, shorten the
 * window in `wrangler.jsonc`; the arithmetic is in `docs/edge-cache.md`.
 *
 * Deploy: `npx wrangler@latest deploy` from this directory.
 */
export default {
  async scheduled(_controller, env, ctx) {
    const url = new URL('/manifest.json', env.ORIGIN);
    ctx.waitUntil(
      fetch(url, { headers: { 'user-agent': 'royaraqamia-warm/1' } })
        .then((response) => response.arrayBuffer())
        .catch(() => {
          // A failed ping must not fail the trigger: the next one is five
          // minutes away, and the origin may simply be mid-deploy.
        })
    );
  },
};
