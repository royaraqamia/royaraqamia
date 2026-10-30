import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { constantName, copySources, declaredStates, validate } from '../check-parity.mjs';

/**
 * The pair list, and the five rules that keep a port a pair (#647, ADR-0098).
 *
 * The check itself is asserted here rather than only run in CI: a guard that
 * silently stops guarding is worse than no guard, and every rule below is the
 * failure the plan card actually shipped with — a missing state, a retyped label,
 * a row nobody claimed.
 */
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

const surfaces = { surfaces: [{ id: 'account-server' }] };

const files = {
  'web/route.tsx': 'export default function Page() { return <PlanView />; }',
  'web/plan-view.tsx': [
    "import { PLAN_CARD_COPY } from './plan-card-copy';",
    'export function PlanView() {',
    '  return (',
    '    <>',
    '      <div aria-label={PLAN_CARD_COPY.loadingLabel} />',
    '      <p>{PLAN_CARD_COPY.title}</p>',
    '      <p>{PLAN_CARD_COPY.signInTitle}</p>',
    '      <p role="alert">{PLAN_CARD_COPY.failed}</p>',
    '    </>',
    '  );',
    '}',
  ].join('\n'),
  'web/plan-card-copy.ts': 'export const PLAN_CARD_COPY = { title: "a", signInTitle: "b" };',
  'android/PlanCard.kt': [
    'fun PlanCard(state: UsageUiState) {',
    '  Text(PlanCardCopy.LOADING_LABEL)',
    '  Text(PlanCardCopy.TITLE)',
    '  Text(PlanCardCopy.SIGN_IN_TITLE)',
    '  Text(PlanCardCopy.FAILED)',
    '}',
  ].join('\n'),
  'android/UsageUiState.kt': [
    'sealed interface UsageUiState {',
    '    data object Loading : UsageUiState',
    '    data class Ready(val model: String) : UsageUiState',
    '    data object SignedOut : UsageUiState',
    '    data object Failed : UsageUiState',
    '}',
  ].join('\n'),
  'android/PlanCardCopy.kt': 'object PlanCardCopy { const val TITLE = "a" }',
  'shared/copy/plan-card.json': JSON.stringify({
    strings: { loadingLabel: 'x', title: 'a', signInTitle: 'b', failed: 'c' },
  }),
};

const manifest = {
  schemaVersion: 1,
  components: [
    {
      id: 'plan-card',
      surface: 'account-server',
      web: {
        route: 'web/route.tsx',
        component: 'web/plan-view.tsx',
        copyModule: 'web/plan-card-copy.ts',
        copyExport: 'PLAN_CARD_COPY',
      },
      native: {
        component: 'android/PlanCard.kt',
        state: 'android/UsageUiState.kt',
        copy: 'android/PlanCardCopy.kt',
        copyObject: 'PlanCardCopy',
      },
      copySource: 'shared/copy/plan-card.json',
      states: [
        { name: 'Loading', copy: 'loadingLabel' },
        { name: 'Ready', copy: 'title' },
        { name: 'SignedOut', copy: 'signInTitle' },
        { name: 'Failed', copy: 'failed' },
      ],
    },
  ],
};

const copies = new Map([
  ['shared/copy/plan-card.json', JSON.parse(files['shared/copy/plan-card.json'])],
]);

function run({ row = {}, manifest: doc, extraFiles = {}, extraCopies = copies } = {}) {
  const patched = doc ?? {
    ...manifest,
    components: [{ ...manifest.components[0], ...row }],
  };
  return validate({
    manifest: patched,
    surfaces,
    copies: extraCopies,
    read: (file) => {
      if (file in extraFiles) return extraFiles[file] ?? null;
      return files[file] ?? null;
    },
  });
}

describe('a pair that matches', () => {
  it('has nothing to report', () => {
    expect(run()).toEqual([]);
  });

  it('is what the repository itself is', () => {
    const real = validate({
      manifest: JSON.parse(readFileSync(join(ROOT, 'docs', 'mobile', 'parity.json'), 'utf8')),
      surfaces: JSON.parse(readFileSync(join(ROOT, 'perf', 'surfaces.json'), 'utf8')),
      copies: copySources(ROOT),
      read: (file) => {
        try {
          return readFileSync(join(ROOT, file), 'utf8');
        } catch {
          return null;
        }
      },
    });
    expect(real).toEqual([]);
  });
});

describe('a pair that drifted', () => {
  it('fails a file that is not there', () => {
    const errors = run({ extraFiles: { 'android/PlanCard.kt': undefined } });
    expect(errors.join('\n')).toContain('android/PlanCard.kt, which does not exist');
  });

  it('fails a state the app declares but the row does not list', () => {
    const errors = run({
      row: {
        states: [
          { name: 'Loading', copy: 'loadingLabel' },
          { name: 'Ready', copy: 'title' },
          { name: 'SignedOut', copy: 'signInTitle' },
        ],
      },
    });
    expect(errors.join('\n')).toContain('declares Failed');
  });

  it('fails a state the row lists but the app does not declare', () => {
    const errors = run({
      row: {
        states: [...manifest.components[0].states, { name: 'Archived', copy: 'title' }],
      },
    });
    expect(errors.join('\n')).toContain('lists states');
  });

  it('fails a state whose string the app does not render', () => {
    const errors = run({
      extraFiles: { 'android/PlanCard.kt': 'fun PlanCard() { Text(PlanCardCopy.TITLE) }' },
    });
    expect(errors.join('\n')).toContain('is not rendered by android/PlanCard.kt');
  });

  it('fails a state whose string the site does not render', () => {
    const errors = run({
      extraFiles: { 'web/plan-view.tsx': "import { PLAN_CARD_COPY } from './plan-card-copy';" },
    });
    expect(errors.join('\n')).toContain('is not rendered by web/plan-view.tsx');
  });

  it('fails copy that only the app reads', () => {
    const errors = run({
      extraCopies: new Map([
        [
          'shared/copy/plan-card.json',
          {
            strings: {
              ...JSON.parse(files['shared/copy/plan-card.json']).strings,
              onlyNative: 'd',
            },
          },
        ],
      ]),
    });
    expect(errors.join('\n')).toContain('key "onlyNative" is not rendered');
  });

  it('fails a copy source no row claims', () => {
    const errors = run({
      extraCopies: new Map([...copies, ['shared/copy/orphan.json', { strings: { a: 'b' } }]]),
    });
    expect(errors.join('\n')).toContain('shared/copy/orphan.json is not claimed');
  });

  it('fails a surface the app is not allowed to draw', () => {
    const errors = run({ row: { surface: 'nowhere' } });
    expect(errors.join('\n')).toContain('perf/surfaces.json does not have');
  });

  it('fails a component that does not read the generated module', () => {
    const errors = run({ extraFiles: { 'web/plan-view.tsx': 'export function PlanView() {}' } });
    expect(errors.join('\n')).toContain('does not import web/plan-card-copy.ts');
  });
});

describe('reading a Kotlin state file', () => {
  it('collects the sealed interface cases and nothing else', () => {
    expect(declaredStates(files['android/UsageUiState.kt'])).toEqual([
      'Loading',
      'Ready',
      'SignedOut',
      'Failed',
    ]);
  });

  it('names a constant the way the generator does', () => {
    expect(constantName('signInTitle')).toBe('SIGN_IN_TITLE');
    expect(constantName('failed')).toBe('FAILED');
  });
});
