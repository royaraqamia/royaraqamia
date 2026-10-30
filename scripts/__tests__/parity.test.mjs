import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  constantName,
  copySources,
  declaredStates,
  portedSources,
  validate,
} from '../check-parity.mjs';

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
    "import { Lock } from 'lucide-react';",
    "import { PLAN_CARD_COPY } from './plan-card-copy';",
    'export function PlanView() {',
    '  return (',
    '    <>',
    '      <Lock className="roy-glyph roy-glyph--md" />',
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
    '  Icon(LucideVectors.Lock)',
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
  'android/LucideVectors.kt': 'object LucideVectors { val Lock: ImageVector by lazy {} }',
  'shared/copy/plan-card.json': JSON.stringify({
    strings: { loadingLabel: 'x', title: 'a', signInTitle: 'b', failed: 'c' },
  }),
};

const icons = { icons: ['Lock'] };

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
    icons,
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
      icons: JSON.parse(readFileSync(join(ROOT, 'shared', 'icons', 'icons.json'), 'utf8')),
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

  it('fails an icon the site draws and the app does not', () => {
    const errors = run({
      extraFiles: { 'android/PlanCard.kt': 'fun PlanCard() { }' },
    });
    expect(errors.join('\n')).toContain('does not draw LucideVectors.Lock');
  });

  it('fails an icon the manifest does not list', () => {
    const errors = run({
      extraFiles: {
        'web/plan-view.tsx':
          "import { Lock, Star } from 'lucide-react';\nimport { PLAN_CARD_COPY } from './plan-card-copy';\n" +
          'const a = PLAN_CARD_COPY.loadingLabel, b = PLAN_CARD_COPY.title, c = PLAN_CARD_COPY.signInTitle, d = PLAN_CARD_COPY.failed;',
        'android/PlanCard.kt': 'Icon(LucideVectors.Lock)\nIcon(LucideVectors.Star)',
      },
    });
    expect(errors.join('\n')).toContain('imports the icon Star');
  });

  it('fails a listed icon no ported component draws', () => {
    const errors = validate({
      manifest: { ...manifest, components: [{ ...manifest.components[0] }] },
      surfaces,
      copies,
      icons: { icons: ['Lock', 'Star'] },
      read: (file) => files[file] ?? null,
    });
    expect(errors.join('\n')).toContain('lists Star, which no ported component draws');
  });

  it('does not read the icon type as a glyph', () => {
    // The site's tab bar imports `type LucideIcon` for its own prop, which draws
    // nothing; only the three glyphs beside it are design (#647).
    const errors = run({
      extraFiles: {
        'web/plan-view.tsx':
          "import { Lock, type LucideIcon } from 'lucide-react';\n" +
          "import { PLAN_CARD_COPY } from './plan-card-copy';\n" +
          'const a = PLAN_CARD_COPY.loadingLabel, b = PLAN_CARD_COPY.title, c = PLAN_CARD_COPY.signInTitle, d = PLAN_CARD_COPY.failed;',
        'android/PlanCard.kt': 'Icon(LucideVectors.Lock)',
      },
    });
    expect(errors.join('\n')).not.toContain('LucideIcon');
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

describe('discovering a ported component', () => {
  const sources = [
    {
      path: 'android/app/src/main/kotlin/com/royaraqamia/app/plans/PlanCard.kt',
      content: 'Recipes.Card.radius',
    },
    {
      path: 'android/app/src/main/kotlin/com/royaraqamia/app/plans/Copy.kt',
      content: 'const val A = "b"',
    },
    {
      path: 'android/app/src/main/kotlin/com/royaraqamia/app/theme/Recipes.kt',
      content: 'object Recipes { val a = 1 }',
    },
    {
      path: 'android/app/src/main/kotlin/com/royaraqamia/app/ui/vectors/LucideVectors.kt',
      content: 'object LucideVectors { val Lock = 1 }',
    },
    {
      path: 'android/app/src/main/kotlin/com/royaraqamia/app/contracts/generated/PlansContracts.kt',
      content: 'LucideVectors.NotReal',
    },
  ];

  it('counts a file that reads the recipe or the glyphs, and only that', () => {
    expect(portedSources(sources)).toEqual([
      'android/app/src/main/kotlin/com/royaraqamia/app/plans/PlanCard.kt',
    ]);
  });

  it('fails a port with no row, naming the file', () => {
    const errors = validate({
      manifest: { ...manifest, components: [] },
      surfaces,
      copies,
      icons,
      read: (file) => files[file] ?? null,
      sources,
    });
    expect(errors.join('\n')).toContain('has no row in docs/mobile/parity.json');
  });

  it('passes when the port is exempted with a reason', () => {
    const errors = validate({
      manifest: {
        ...manifest,
        components: [],
        exempt: [
          {
            path: 'android/app/src/main/kotlin/com/royaraqamia/app/plans/PlanCard.kt',
            reason: 'drawn by the debug workbench, not a product surface',
          },
        ],
      },
      surfaces,
      copies,
      icons,
      read: (file) =>
        file === 'android/app/src/main/kotlin/com/royaraqamia/app/plans/PlanCard.kt'
          ? 'Recipes.Card.radius'
          : (files[file] ?? null),
      sources,
    });
    expect(errors.filter((error) => error.includes('has no row'))).toEqual([]);
  });

  it('refuses an exemption without a reason, or one that is also a row', () => {
    const withoutReason = validate({
      manifest: {
        ...manifest,
        exempt: [{ path: 'android/app/src/main/kotlin/com/royaraqamia/app/plans/PlanCard.kt' }],
      },
      surfaces,
      copies,
      icons,
      read: (file) => files[file] ?? null,
      sources,
    });
    expect(withoutReason.join('\n')).toContain('needs a "path" and a "reason"');

    const both = validate({
      manifest: {
        ...manifest,
        exempt: [
          {
            path: 'android/PlanCard.kt',
            reason: 'nope',
          },
        ],
      },
      surfaces,
      copies,
      icons,
      read: (file) => files[file] ?? null,
      sources,
    });
    expect(both.join('\n')).toContain('is both a row and exempt');
  });
});
