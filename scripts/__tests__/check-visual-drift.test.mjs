import { describe, expect, it } from 'vitest';

import {
  evidencePrefix,
  validate,
  validateWaivers,
  webPathsBySurface,
} from '../check-visual-drift.mjs';

const TODAY = '2026-11-19';
const gate = {
  surfaces: [
    { surface: 'community', web: { route: '/community' }, states: [] },
    { surface: 'notes', web: { route: '/notes' }, states: [] },
  ],
};
const parity = {
  components: [
    {
      surface: 'community',
      web: {
        route: 'app/community/page.tsx',
        component: 'frontend/ui/community/post-card.tsx',
        copyModule: 'frontend/ui/community/post-copy.ts',
      },
      copySource: 'shared/copy/post.json',
    },
    {
      surface: 'notes',
      web: { route: 'app/notes/(app)/page.tsx', component: 'frontend/ui/notes/notes-list.tsx' },
      copySource: 'shared/copy/notes-list.json',
    },
  ],
};
const waivers = { waivers: [] };
const check = (changed, overrides = {}) =>
  validate({ changed, gate, parity, waivers, today: TODAY, ...overrides });

describe('web paths', () => {
  it('maps the web files that draw a surface to that surface', () => {
    const paths = webPathsBySurface(parity);
    expect([...paths.get('community')]).toEqual(
      expect.arrayContaining([
        'app/community/page.tsx',
        'frontend/ui/community/post-card.tsx',
        'frontend/ui/community/post-copy.ts',
        'shared/copy/post.json',
      ])
    );
  });

  it('names the evidence directory of exactly one surface', () => {
    expect(evidencePrefix('notes')).toBe('e2e/__visual__/notes/');
  });
});

describe('the drift gate', () => {
  it('passes when no gated surface was touched', () => {
    const result = check(['frontend/ui/rates/rates-page.tsx', 'docs/README.md']);
    expect(result.errors).toEqual([]);
    expect(result.touched.size).toBe(0);
  });

  it('fails when a gated surface web component changes without evidence', () => {
    const result = check(['frontend/ui/notes/notes-list.tsx']);
    expect(result.touched.has('notes')).toBe(true);
    expect(result.errors.join(' ')).toContain('no new visual evidence');
  });

  it('also treats a contract change as a web-side change', () => {
    expect(check(['shared/visual/community.json']).errors).toHaveLength(1);
  });

  it('passes when the surface evidence changed in the same pull request', () => {
    const result = check([
      'frontend/ui/notes/notes-list.tsx',
      'e2e/__visual__/notes/at-rest/web.png',
    ]);
    expect(result.errors).toEqual([]);
  });

  it('does not let another surface evidence satisfy this one', () => {
    const result = check([
      'frontend/ui/notes/notes-list.tsx',
      'e2e/__visual__/community/at-rest/web.png',
    ]);
    expect(result.errors).toHaveLength(1);
  });

  it('touches every surface that reads a changed shared copy source', () => {
    const shared = {
      ...parity,
      components: [...parity.components, { ...parity.components[1], id: 'x' }],
    };
    shared.components[0].copySource = 'shared/copy/shared.json';
    shared.components[1].copySource = 'shared/copy/shared.json';
    const result = check(['shared/copy/shared.json'], { parity: shared });
    expect([...result.touched].sort()).toEqual(['community', 'notes']);
    expect(result.errors).toHaveLength(2);
  });

  it('ignores a surface that is not under the visual gate', () => {
    const result = check(['frontend/ui/admin/admin-console-view.tsx']);
    expect(result.errors).toEqual([]);
  });
});

describe('waivers', () => {
  it('accepts a valid, current waiver', () => {
    const result = check(['frontend/ui/notes/notes-list.tsx'], {
      waivers: {
        waivers: [
          { surface: 'notes', reason: 'Server-side refactor', issue: '#1234', until: '2026-12-31' },
        ],
      },
    });
    expect(result.errors).toEqual([]);
    expect([...result.touched]).toEqual(['notes']);
  });

  it('rejects an expired waiver', () => {
    const { errors } = validateWaivers(
      { waivers: [{ surface: 'notes', reason: 'Old', issue: '#1', until: '2026-01-01' }] },
      TODAY
    );
    expect(errors.join(' ')).toContain('expired');
  });

  it('rejects a waiver without a reason, issue or expiry', () => {
    const { errors } = validateWaivers({ waivers: [{ surface: 'notes' }] }, TODAY);
    expect(errors).toHaveLength(3);
  });
});
