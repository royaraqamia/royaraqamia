import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * The recitation controller's thread (#626).
 *
 * `MediaController` asserts, on every call, that it is on the looper it was
 * built on, and Capacitor invokes a plugin method on its own bridge looper.
 * Building the controller from there made `addListener` throw — so the load
 * never reached `QuranPlaybackService` and the page reported a streamable sura
 * as «غير محفوظة على هذا الجُهاز» — while leaving `controller` non-null, so the
 * next press called `sendCustomCommand` on the main thread, threw
 * `IllegalStateException` there, and took the process with it.
 *
 * Checked as source text, like the launch skeleton: the shell's JVM tests run
 * without an Android runtime, and a media3 `MediaController` has no host-side
 * double to assert a thread against.
 */

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PLUGIN = join(
  ROOT,
  'android',
  'app',
  'src',
  'main',
  'java',
  'com',
  'royaraqamia',
  'app',
  'QuranPlayerPlugin.java'
);

const source = readFileSync(PLUGIN, 'utf8');

/** The body of a method, from its opening brace to the one that closes it. */
function bodyOf(text, signature) {
  const declaration = text.indexOf(signature);
  expect(declaration, `QuranPlayerPlugin: no \`${signature}\``).toBeGreaterThan(-1);
  const open = text.indexOf('{', declaration);
  let depth = 0;
  for (let index = open; index < text.length; index += 1) {
    if (text[index] === '{') depth += 1;
    else if (text[index] === '}') {
      depth -= 1;
      if (depth === 0) return text.slice(open, index + 1);
    }
  }
  throw new Error(`QuranPlayerPlugin: ${signature} does not close`);
}

/** Every `main.post(...)` in a body, as index ranges. */
function postedRanges(body) {
  const ranges = [];
  const marker = 'main.post(';
  let from = 0;
  for (;;) {
    const at = body.indexOf(marker, from);
    if (at < 0) return ranges;
    let depth = 0;
    let index = at + marker.length - 1;
    for (; index < body.length; index += 1) {
      if (body[index] === '(') depth += 1;
      else if (body[index] === ')') {
        depth -= 1;
        if (depth === 0) break;
      }
    }
    ranges.push([at, index]);
    from = index + 1;
  }
}

const isPosted = (ranges, at) => ranges.some(([start, end]) => at > start && at < end);

/** The plugin methods the page calls, as `{ name, body }`. */
function pluginMethods(text) {
  const methods = [];
  const pattern = /@PluginMethod\s+public void (\w+)\([^)]*\)\s*\{/g;
  for (let match = pattern.exec(text); match; match = pattern.exec(text)) {
    const open = text.indexOf('{', match.index + match[0].length - 1);
    const start = open;
    let depth = 0;
    let index = open;
    for (; index < text.length; index += 1) {
      if (text[index] === '{') depth += 1;
      else if (text[index] === '}') {
        depth -= 1;
        if (depth === 0) break;
      }
    }
    methods.push({ name: match[1], body: text.slice(start, index + 1) });
  }
  return methods;
}

/** Comments name the controller too, and a comment cannot call anything. */
const withoutComments = (text) => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

/** Reads the controller's own state, which only its own thread may do. */
const CONTROLLER_STATE = /\bcontroller(Future)?\b/g;

describe('the recitation controller’s thread', () => {
  it('reads the controller from a @PluginMethod only inside a main post', () => {
    // The bridge looper is the caller. A method that resolves the controller
    // therefore has to post; one that never names it may run where it likes.
    const offenders = [];
    for (const method of pluginMethods(source)) {
      const body = withoutComments(method.body);
      const posted = postedRanges(body);
      for (const match of body.matchAll(CONTROLLER_STATE)) {
        if (!isPosted(posted, match.index)) offenders.push(`${method.name}: ${match[0]}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('is handed to every action by one post, not by the caller’s thread', () => {
    const body = bodyOf(
      source,
      'private void withController(PluginCall call, WithController action)'
    );
    expect(body.replace(/\s+/g, ' ').trim()).toBe(
      '{ main.post(() -> runWithController(call, action)); }'
    );
  });

  it('is built on the main looper, once, in ensureController', () => {
    const builders = source.match(/new MediaController\.Builder\(/g) ?? [];
    expect(builders).toHaveLength(1);

    const builderAt = source.indexOf('new MediaController.Builder(');
    const build = bodyOf(source, 'private ListenableFuture<MediaController> ensureController()');
    const buildStart = source.indexOf(
      'private ListenableFuture<MediaController> ensureController()'
    );
    expect(builderAt).toBeGreaterThan(buildStart);
    expect(builderAt).toBeLessThan(buildStart + build.length);

    // The connection's own listener has to come back on main too: it registers
    // the player listener and emits the first state.
    expect(build).toContain('ContextCompat.getMainExecutor(getContext())');
  });

  it('posts to the main looper rather than to whichever looper loaded the plugin', () => {
    expect(source).toContain('new Handler(Looper.getMainLooper())');
  });
});

describe('a stop and a reconnect', () => {
  it('drops a controller that half-connected instead of vouching for it', () => {
    // `isConnected()` answered true for the wrong-threaded controller the crash
    // came through, so the failure path must release rather than just null the
    // future.
    const build = bodyOf(source, 'private ListenableFuture<MediaController> ensureController()');
    expect(build).toMatch(/catch \(Exception ignored\) \{[\s\S]*releaseController\(\);/);
  });

  it('releases a controller that a stop superseded while it was connecting', () => {
    const build = bodyOf(source, 'private ListenableFuture<MediaController> ensureController()');
    expect(build).toContain('if (controllerFuture != future)');
    expect(build).toMatch(/controllerFuture != future\) \{[\s\S]*?connected\.release\(\);/);
  });
});
