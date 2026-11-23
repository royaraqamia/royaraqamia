import { describe, expect, it } from 'vitest';

import { sanitizeVisualSvg } from '@/backend/services/chat/visual-sanitize';

describe('visual sanitizer (ADR-0215)', () => {
  it('keeps a static drawing', () => {
    const svg = '<svg viewBox="0 0 10 10"><rect width="10" height="10" fill="red"/></svg>';
    expect(sanitizeVisualSvg(svg)).toBe(
      '<svg viewBox="0 0 10 10"><rect width="10" height="10" fill="red"></rect></svg>'
    );
  });

  it('refuses scripts, foreign content and event handlers', () => {
    for (const svg of [
      '<svg viewBox="0 0 10 10"><script>alert(1)</script></svg>',
      '<svg><foreignObject>x</foreignObject></svg>',
      '<svg onclick="steal()"><rect width="1"/></svg>',
      '<svg><rect onload="bad()" width="1"/></svg>',
    ]) {
      expect(sanitizeVisualSvg(svg)).toBeNull();
    }
  });

  it('refuses external images and remote paint references', () => {
    expect(
      sanitizeVisualSvg(
        '<svg xmlns="http://www.w3.org/2000/svg"><image href="https://evil.example/x.png"/></svg>'
      )
    ).toBeNull();
    expect(
      sanitizeVisualSvg('<svg><rect fill="url(https://evil.example/x)" width="1"/></svg>')
    ).toBeNull();
  });

  it('keeps an internal gradient reference', () => {
    const svg =
      '<svg><defs><linearGradient id="g"><stop stop-color="red"/></linearGradient></defs><rect fill="url(#g)" width="1"/></svg>';
    expect(sanitizeVisualSvg(svg)).toContain('url(#g)');
  });

  it('refuses anything that is not a complete svg', () => {
    expect(sanitizeVisualSvg('not svg')).toBeNull();
    expect(sanitizeVisualSvg('<svg><rect/></svg> trailing')).toBeNull();
  });
});
