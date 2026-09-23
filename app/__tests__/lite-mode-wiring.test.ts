import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, it, expect } from 'vitest';
import { getLiteModeScript, LITE_CLASS } from '@/frontend/shared/lite-mode';

const ROOT = process.cwd();

function read(p: string): string {
  return readFileSync(resolve(ROOT, p), 'utf8');
}

/**
 * The `lite` contract is only worth having if it is applied before the first
 * paint. These assertions guard the wiring in the root layout: the script must
 * be emitted into `<head>` and the CSS must be keyed off the same class, or the
 * capability check is decoration.
 */
describe('lite mode wiring', () => {
  const layout = read('app/layout.tsx');

  it('injects the pre-paint script in the document head', () => {
    const call = layout.indexOf('getLiteModeScript()');
    expect(call).toBeGreaterThan(-1);

    // The *call site* must live inside <head>, ahead of the <body> element, so
    // the class is on <html> before the body parses. Match the element by its
    // line, not by a bare `<body` substring — prose in the comment also
    // mentions it.
    const head = layout.indexOf('<head>');
    const bodyElement = layout.search(/^\s*<body\s*>$/m);
    expect(head).toBeGreaterThan(-1);
    expect(bodyElement).toBeGreaterThan(-1);
    expect(call).toBeGreaterThan(head);
    expect(call).toBeLessThan(bodyElement);

    // And it must be rendered, not merely computed.
    expect(layout).toContain('dangerouslySetInnerHTML');
  });

  it('emits a script whose source matches the contract', () => {
    const script = getLiteModeScript();
    expect(script).toContain('documentElement');
    expect(script).toContain('prefers-reduced-motion');
    // A parse failure inside the inline script would silently strand the site
    // on full effects; prove it is syntactically valid here.
    expect(() => new Function(script)).not.toThrow();
  });

  it('keys the lite overrides off the class the script applies', () => {
    const css = read('app/global.css');
    expect(css).toContain(`html.${LITE_CLASS}`);
    // Every glass surface that carries a backdrop-filter must have a lite reset.
    for (const surface of ['\\.glass\\b', '\\.glass-card', '\\.glass-strong', '\\.glass-navbar']) {
      expect(css).toMatch(new RegExp(`html\\.${LITE_CLASS}\\s+${surface}`));
    }
    expect(css).toMatch(new RegExp(`\\.${LITE_CLASS}\\b[^{]*\\{[^}]*backdrop-filter:\\s*none`));
  });

  it('documents the contract and its override seam', () => {
    const docs = read('docs/performance.md');
    // Name the three signals a follow-on ticket will build on.
    expect(docs).toContain('`html.lite`');
    expect(docs).toContain('data-lite');
    expect(docs).toContain('rr:lite');
    expect(docs).toContain('override');
  });
});
