import { describe, expect, it } from 'vitest';

import { renderMarkdown, validate } from '../check-plan.mjs';

const surfaces = {
  schemaVersion: 1,
  surfaces: [
    { id: 'verify', routes: ['/verify'] },
    { id: 'rates', routes: ['/rates'] },
    { id: 'admin', prefix: '/admin' },
  ],
};

const screens = (...enabled) => ({
  schemaVersion: 1,
  screens: [
    { surface: 'verify', native: 'a/VerifyScreen.kt', enabled: false },
    { surface: 'rates', native: 'a/RatesScreen.kt', enabled: false },
    { surface: 'admin', native: null, reason: 'operator surfaces are blocked' },
  ].map((row) => (enabled.includes(row.surface) ? { ...row, enabled: true } : row)),
});

const phases = [
  { id: 'gate', title: 'Prove the gate', why: 'screens that exist' },
  { id: 'operator', title: 'Operator', why: 'a security review first' },
];

const plan = (...rows) => ({
  schemaVersion: 1,
  phases,
  surfaces: rows,
});

const THREEE = [
  { surface: 'verify', phase: 'gate', state: 'todo' },
  { surface: 'rates', phase: 'gate', state: 'todo' },
  { surface: 'admin', phase: 'operator', state: 'blocked', blockedBy: '#660' },
];

const parity = { components: [{ id: 'rates-page', surface: 'rates' }] };

const check = ({ plan: p = plan(...THREEE), s = screens(), pa = parity } = {}) =>
  validate({ plan: p, screens: s, surfaces, parity: pa });

describe('the plan', () => {
  it('accepts a list that covers every surface in order', () => {
    expect(check()).toEqual([]);
  });

  it('refuses a surface nobody listed', () => {
    expect(check({ plan: plan(THREEE[0], THREEE[1]) })).toEqual([
      'surface "admin" has no row in docs/mobile/parity-plan.json (every screen is on the list)',
    ]);
  });

  it('refuses a row for a surface that does not exist', () => {
    expect(
      check({ plan: plan(...THREEE, { surface: 'gone', phase: 'operator', state: 'todo' }) })
    ).toEqual(['row "gone" names a surface perf/surfaces.json does not have']);
  });

  it('refuses the same surface twice', () => {
    expect(check({ plan: plan(...THREEE, THREEE[0]) })).toEqual([
      'docs/mobile/parity-plan.json: "verify" appears twice',
    ]);
  });

  it('refuses a phase it does not declare', () => {
    expect(
      check({
        plan: plan({ surface: 'verify', phase: 'someday', state: 'todo' }, THREEE[1], THREEE[2]),
      })
    ).toEqual(['row "verify" names phase "someday", which is not declared']);
  });

  it('refuses a state that is not one of the three', () => {
    expect(
      check({
        plan: plan({ surface: 'verify', phase: 'gate', state: 'done' }, THREEE[1], THREEE[2]),
      })
    ).toEqual(['row "verify" has state "done", which is not native, todo or blocked']);
  });

  it('refuses a blocked row with no reason, and a reason with no block', () => {
    expect(
      check({
        plan: plan(THREEE[0], THREEE[1], { surface: 'admin', phase: 'operator', state: 'blocked' }),
      })
    ).toEqual(['row "admin" is blocked and does not say by what ("blockedBy")']);
    expect(
      check({
        plan: plan(THREEE[0], THREEE[1], {
          surface: 'admin',
          phase: 'operator',
          state: 'todo',
          blockedBy: '#660',
        }),
      })
    ).toEqual(['row "admin" names a blocker but is not blocked']);
  });

  it('refuses a plan that disagrees with screens.json about what is on', () => {
    expect(check({ s: screens('verify') })).toEqual([
      'row "verify" is "todo" and docs/mobile/screens.json has it enabled',
    ]);
    expect(
      check({
        plan: plan({ surface: 'verify', phase: 'gate', state: 'native' }, THREEE[1], THREEE[2]),
      })
    ).toEqual(['row "verify" is native and docs/mobile/screens.json does not have it enabled']);
  });

  it('refuses a phase whose rows are split by another phase', () => {
    expect(check({ plan: plan(THREEE[0], THREEE[2], THREEE[1]) })).toEqual([
      'row "rates" returns to phase "gate" after another phase started',
    ]);
  });

  it('refuses an issue that is not #<number>', () => {
    expect(check({ plan: plan({ ...THREEE[0], issue: '770' }, THREEE[1], THREEE[2]) })).toEqual([
      'row "verify" names issue "770", which is not #<number>',
    ]);
  });

  it('refuses a component whose surface is not listed', () => {
    expect(check({ pa: { components: [{ id: 'ghost-card', surface: 'ghost' }] } })).toEqual([
      'component "ghost-card" belongs to surface "ghost", which the plan does not list',
    ]);
  });

  it('refuses no phases at all', () => {
    expect(
      validate({
        plan: { schemaVersion: 1, phases: [], surfaces: THREEE },
        screens: screens(),
        surfaces,
        parity,
      })
    ).toEqual([
      'docs/mobile/parity-plan.json: no phases, so nothing can be ordered',
      'row "verify" names phase "gate", which is not declared',
      'row "rates" names phase "gate", which is not declared',
      'row "admin" names phase "operator", which is not declared',
    ]);
  });
});

describe('the rendered list', () => {
  const data = () => ({
    plan: plan(...THREEE),
    screens: screens(),
    surfaces,
    parity,
  });

  it('ticks a native screen and leaves the rest open, in phase order', () => {
    const rendered = renderMarkdown(data());

    expect(rendered).toContain('- [ ] **verify** `/verify` — todo');
    expect(rendered).toContain('- [ ] **admin** `/admin/**` — blocked · blocked by #660');
    expect(rendered.indexOf('## Prove the gate')).toBeLessThan(rendered.indexOf('## Operator'));
    expect(rendered).toContain('0 native · 2 to do · 1 blocked of 3 surfaces');
  });

  it('ticks the component of a native surface', () => {
    const dataWithNative = data();
    dataWithNative.plan = plan(
      { surface: 'verify', phase: 'gate', state: 'todo' },
      { surface: 'rates', phase: 'gate', state: 'native' },
      THREEE[2]
    );
    dataWithNative.screens = screens('rates');

    expect(renderMarkdown(dataWithNative)).toContain('- [x] `rates-page` on **rates**');
  });

  it('carries no generated-file header when it is an issue body, and links the ADR absolutely', () => {
    const body = renderMarkdown(data(), { issue: true });

    expect(body.startsWith('One line per surface')).toBe(true);
    expect(body).toContain('https://github.com/royaraqamia/royaraqamia/blob/main/docs/adr/');
    expect(body).not.toContain('Generated by scripts/check-plan.mjs');
  });
});
