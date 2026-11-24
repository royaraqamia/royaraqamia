import { init, captureException } from '@sentry/browser';

/**
 * The standalone client error reporter, bundled by
 * `scripts/build-sentry-client.mjs` into `public/sentry-client.js`.
 *
 * It lives outside the Next client graph on purpose (#1820): Turbopack emits a
 * `<script async>` tag in prerendered HTML for every reachable dynamic import,
 * so even a lazy `import('@sentry/browser')` downloaded the SDK on a clean
 * visit. A plain same-origin script injected on the first error has no such
 * tag and is fetched only when there is something to send. esbuild tree-shakes
 * `@sentry/browser`'s unused re-exports, so Replay is not in this bundle.
 */

type InitOptions = {
  dsn?: string;
  environment?: string;
  release?: string;
  integrations?: unknown[];
  tunnel?: string;
  tracesSampleRate?: number;
};

type Reporter = {
  init: (options: InitOptions) => void;
  captureException: (error: unknown, hint?: { extra?: Record<string, unknown> }) => void;
};

declare global {
  interface Window {
    __RoyaSentry?: Reporter;
  }
}

window.__RoyaSentry = { init, captureException } as Reporter;
