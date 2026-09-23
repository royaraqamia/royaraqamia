/**
 * The `lite` contract.
 *
 * Some devices cannot afford the site's glassmorphism: backdrop filters and
 * large glow blurs are the single most expensive paint effect we ship, and on a
 * low-end phone they turn scrolling into a slideshow. This module decides —
 * before first paint — whether the current device gets the full-effects
 * rendering or the `lite` one, and records that decision on `<html>` so CSS and
 * later tickets can read it.
 *
 * The decision is exposed through three names, and they are stable:
 *
 * - `html.lite` — the class the stylesheet keys off (`app/global.css`).
 * - `html[data-lite="true"]` — the same signal as an attribute, for selectors a
 *   class cannot express and for tooling that inspects the DOM.
 * - `localStorage["rr:lite"]` — `"true"` / `"false"`, written whenever the check
 *   runs, so a later ticket can offer a manual toggle without re-deciding.
 *
 * This module is imported by the pre-paint inline script in the root layout, so
 * it must stay dependency-free, side-effect-free on import, and small enough to
 * inline.
 */

export const LITE_CLASS = 'lite';
export const LITE_ATTRIBUTE = 'data-lite';
export const LITE_STORAGE_KEY = 'rr:lite';

/**
 * Low-end tiers. `deviceMemory` is capped by the `Device Memory` spec at 8, so
 * `<= 4 GB` catches the reporting devices that stutter; `hardwareConcurrency`
 * is uncapped and `<= 4` logs the budget Android class this program targets.
 */
export const MEMORY_TIERS = { lowEndGb: 4 } as const;
export const CORE_TIERS = { lowEnd: 4 } as const;

/**
 * `navigator.deviceMemory` is shipped but still missing from TS's global
 * `Navigator` in some lib configurations, so the capability check reads it
 * through this structural view rather than via `any`.
 */
interface NavigatorHints {
  deviceMemory?: number;
}

export interface LiteSignals {
  /** `prefers-reduced-motion: reduce` — a stated preference, not a capability. */
  reducedMotion: boolean;
  /** `navigator.deviceMemory`, in GB. Absent on engines that do not report it. */
  deviceMemory?: number;
  /** `navigator.hardwareConcurrency`. Absent on engines that do not report it. */
  hardwareConcurrency?: number;
  /** A previously stored verdict; when present it overrides every other signal. */
  override?: boolean;
}

/**
 * The one decision rule. Absent signals are ignored rather than guessed at:
 * an engine that does not report memory must not be marked lite just because
 * `undefined <= 4` is false in the other direction.
 */
export function resolveLiteDevice(signals: LiteSignals): boolean {
  if (typeof signals.override === 'boolean') return signals.override;
  if (signals.reducedMotion) return true;
  if (typeof signals.deviceMemory === 'number' && signals.deviceMemory <= MEMORY_TIERS.lowEndGb) {
    return true;
  }
  if (
    typeof signals.hardwareConcurrency === 'number' &&
    signals.hardwareConcurrency <= CORE_TIERS.lowEnd
  ) {
    return true;
  }
  return false;
}

/** Records the verdict on the document element. Idempotent. */
export function applyLiteClass(root: Element, isLite: boolean): void {
  if (isLite) {
    root.classList.add(LITE_CLASS);
    root.setAttribute(LITE_ATTRIBUTE, 'true');
  } else {
    root.classList.remove(LITE_CLASS);
    root.removeAttribute(LITE_ATTRIBUTE);
  }
}

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function persistVerdict(storage: StorageLike | undefined, isLite: boolean): void {
  try {
    storage?.setItem(LITE_STORAGE_KEY, isLite ? 'true' : 'false');
  } catch {
    // Private mode, blocked storage, or a hostile `localStorage` getter: the
    // capability check must never be the reason a page fails to render.
  }
}

interface LiteEnvironment extends LiteSignals {
  matchMedia?: (query: string) => { matches: boolean } & Partial<MediaQueryList>;
  storage?: StorageLike;
}

function readEnvironment(environment?: Partial<LiteEnvironment>): LiteEnvironment {
  const nav =
    typeof navigator === 'undefined' ? undefined : (navigator as Navigator & NavigatorHints);
  return {
    reducedMotion:
      environment?.reducedMotion ??
      (typeof window !== 'undefined' && typeof window.matchMedia === 'function'
        ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
        : false),
    deviceMemory: environment?.deviceMemory ?? nav?.deviceMemory,
    hardwareConcurrency: environment?.hardwareConcurrency ?? nav?.hardwareConcurrency,
    override: environment?.override,
    matchMedia: environment?.matchMedia,
    storage: environment?.storage,
  };
}

/**
 * Reads the ambient signals, decides once, and records the verdict so other
 * code can see it. Then watches `prefers-reduced-motion` and re-decides when
 * the user changes it mid-session.
 *
 * The capability decision is deliberately **not** seeded from what we persisted
 * last time. The persisted value is a memo for *other* code, not an input to
 * this one: feeding it back would freeze the verdict at whatever the first run
 * happened to see, so a user who later turns on reduced motion would never be
 * marked lite. `override` is reserved for an explicit caller-supplied choice (a
 * future manual toggle), and that is the only thing that outranks the live
 * signals.
 *
 * Returns a cleanup function that unsubscribes. The initial verdict is *not*
 * reverted on cleanup: the class describes the device, and callers that want it
 * gone call `applyLiteClass(root, false)` themselves.
 */
export function installLiteMode(
  root: Element = document.documentElement,
  environment?: Partial<LiteEnvironment>
): () => void {
  const resolved = readEnvironment(environment);

  const apply = (isLite: boolean) => {
    applyLiteClass(root, isLite);
    persistVerdict(resolved.storage, isLite);
  };

  const decide = (reducedMotion: boolean) =>
    resolveLiteDevice({
      reducedMotion,
      deviceMemory: resolved.deviceMemory,
      hardwareConcurrency: resolved.hardwareConcurrency,
      override: resolved.override,
    });

  apply(decide(resolved.reducedMotion));

  if (typeof resolved.matchMedia !== 'function') return () => {};

  const query = resolved.matchMedia('(prefers-reduced-motion: reduce)');
  const onChange = () => apply(decide(query.matches));

  if (typeof query.addEventListener === 'function') {
    query.addEventListener('change', onChange);
    return () => query.removeEventListener?.('change', onChange);
  }

  return () => {};
}

/**
 * The script text inlined into `<head>` by the root layout. It runs before any
 * body markup is parsed, so the `lite` class is on `<html>` for the first
 * paint — no flash of the full-effects rendering on a device that cannot
 * afford it.
 *
 * The emitted function source is minified of its own escapes, not of behaviour:
 * `resolveLiteDevice.toString()` carries the real decision rule, so this module
 * stays the single source of truth. `applyLiteClass` is reassigned to a
 * function expression for the same reason — its classList calls survive
 * esbuild's TS→JS pass as-is, unlike the exported declaration's.
 *
 * `resolveLiteDevice` reads the tiers through identifiers the inline scope does
 * not have, so its source is rewritten to literals before being emitted. The
 * rewrite is asserted against the live constants in the test suite: if the
 * tiers move, the script must move with them.
 *
 * The emitted script does not read or write `localStorage`: the persisted value
 * is a memo for other code, and seeding the decision from it would freeze the
 * verdict (see `installLiteMode`). It mirrors `installLiteMode` in all other
 * respects, and the two are kept honest by the same test suite.
 */
export function getLiteModeScript(): string {
  const decisionRule = resolveLiteDevice
    .toString()
    .replaceAll('MEMORY_TIERS.lowEndGb', String(MEMORY_TIERS.lowEndGb))
    .replaceAll('CORE_TIERS.lowEnd', String(CORE_TIERS.lowEnd));

  return `(function(rx,ap){function ps(s,v){try{s&&s.setItem('${LITE_STORAGE_KEY}',v?'true':'false')}catch(e){}}function run(){try{var q=window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)');var v=rx({reducedMotion:!!(q&&q.matches),deviceMemory:navigator.deviceMemory,hardwareConcurrency:navigator.hardwareConcurrency});ap(document.documentElement,v);ps(window.localStorage,v);if(q&&q.addEventListener){q.addEventListener('change',function(){var n=rx({reducedMotion:!!q.matches,deviceMemory:navigator.deviceMemory,hardwareConcurrency:navigator.hardwareConcurrency});ap(document.documentElement,n);ps(window.localStorage,n)})}}catch(e){}}run()})(${decisionRule},function(r,v){if(v){r.classList.add('${LITE_CLASS}');r.setAttribute('${LITE_ATTRIBUTE}','true')}else{r.classList.remove('${LITE_CLASS}');r.removeAttribute('${LITE_ATTRIBUTE}')}});`;
}
