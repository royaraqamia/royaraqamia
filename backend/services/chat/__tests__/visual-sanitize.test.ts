import { describe, expect, it } from 'vitest';

import { sanitizeVisualSvg } from '@/backend/services/chat/visual-sanitize';

describe('visual sanitizer (ADR-0215)', () => {
  it('keeps a static drawing', () => {
    const svg = '<svg viewBox="0 0 10 10"><rect width="10" height="10" fill="red"/></svg>';
    expect(sanitizeVisualSvg(svg)).toBe(svg);
  });

  it('removes scripts, foreign content and event handlers', () => {
    const svg =
      '<svg viewBox="0 0 10 10" onclick="steal()"><script>alert(1)</script><foreignObject>x</foreignObject><rect onload="bad()" width="10"/></svg>';
    const clean = sanitizeVisualSvg(svg);
    expect(clean).toContain('<rect');
    expect(clean).not.toContain('<script');
    expect(clean).not.toContain('foreignObject');
    expect(clean).not.toContain('onclick');
    expect(clean).not.toContain('onload');
  });

  it('removes links and remote references', () => {
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg"><image href="https://evil.example/x.png"/><rect fill="url(https://evil.example/x)"/></svg>';
    const clean = sanitizeVisualSvg(svg);
    expect(clean).not.toContain('href=');
    expect(clean).not.toContain('url(https');
  });

  it('refuses anything that is not a complete svg', () => {
    expect(sanitizeVisualSvg('not svg')).toBeNull();
    expect(sanitizeVisualSvg('<svg><rect/></svg> trailing')).toBeNull();
  });
});
