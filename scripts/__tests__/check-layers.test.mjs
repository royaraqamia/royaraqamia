import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';

import { atoms, classAtoms, classLists, expandBraces, maskComments } from '../check-layers.mjs';

describe('atoms', () => {
  it('expands the sides of a shorthand so `py-4` and `pt-5` can be compared', () => {
    expect(atoms('padding-top')).toContain('padding-top');
    expect(atoms('padding-block')).toEqual(
      expect.arrayContaining(['padding-top', 'padding-bottom'])
    );
    expect(atoms('margin-inline-start')).toEqual(
      expect.arrayContaining(['margin-inline-start', 'margin-left'])
    );
    expect(atoms('inset')).toEqual(expect.arrayContaining(['top', 'right', 'bottom', 'left']));
  });

  it('keeps a single property as itself, and folds the border shorthands', () => {
    expect(atoms('display')).toEqual(['display']);
    expect(atoms('border')).toEqual(
      expect.arrayContaining(['border-width', 'border-style', 'border-color'])
    );
    expect(atoms('border-top-left-radius')).toEqual(['border-radius']);
    expect(atoms('overflow')).toEqual(['overflow-x', 'overflow-y']);
  });

  it('ignores a vendor prefix', () => {
    expect(atoms('-webkit-line-clamp')).toEqual(['line-clamp']);
  });
});

describe('classAtoms', () => {
  it('reads a class, its declarations and the logical sides they cover', () => {
    const map = classAtoms(
      '.pt-5 { padding-top: 1.25rem; } .max-sm\\:pt-4 { padding-top: 1rem; } .hidden { display: none; }'
    );

    expect(map.get('pt-5')).toEqual(new Set(['padding-top']));
    expect(map.get('max-sm:pt-4')).toEqual(new Set(['padding-top']));
    expect(map.get('hidden')).toEqual(new Set(['display']));
  });

  it('skips keyframe selectors that look like classes', () => {
    const map = classAtoms('@keyframes fade { 0% { opacity: 0 } } .fade { display: block }');
    expect(map.has('0%')).toBe(false);
    expect(map.get('fade')).toEqual(new Set(['display']));
  });
});

describe('expandBraces', () => {
  it('expands an alternative the way a @source line writes one', () => {
    expect(expandBraces('../ui/{A,B}.tsx')).toEqual(['../ui/A.tsx', '../ui/B.tsx']);
  });

  it('leaves a pattern without braces alone', () => {
    expect(expandBraces('../ui/primitives')).toEqual(['../ui/primitives']);
  });
});

describe('maskComments', () => {
  it('blanks a doc comment without moving a line', () => {
    const masked = maskComments('/**\n * a fully rounded pill\n */\nconst a = 1;');
    expect(masked.split('\n')).toHaveLength(4);
    expect(masked).not.toContain('rounded');
    expect(masked.split('\n')[3]).toBe('const a = 1;');
  });

  it('keeps a url inside a string and a template literal intact', () => {
    const source = "const url = 'https://example.com'; const t = `a // b`;";
    expect(maskComments(source)).toBe(source);
  });
});

describe('classLists', () => {
  const known = new Set(['text-3xl', 'sm:text-4xl', 'flex-col', 'sm:flex-row', 'rounded']);

  it('reads a class list kept in a constant, not only a className', () => {
    const lists = classLists("const SIZES = { section: 'text-3xl sm:text-4xl' };", known);
    expect(lists[0]?.tokens).toEqual(['text-3xl', 'sm:text-4xl']);
  });

  it('ignores prose in a comment that names a utility', () => {
    const source = '/**\n * `lg` and up get the fully rounded pill.\n */\nconst a = 1;';
    expect(classLists(source, known)).toEqual([]);
  });

  it('keeps a literal with a single class out of the pairs', () => {
    expect(classLists("const a = 'rounded';", known)).toEqual([]);
  });

  it('reads one className expression as one list, across its cn() arguments', () => {
    const known2 = new Set(['grid', 'max-sm:flex', 'p-6']);
    const lists = classLists("className={cn('grid p-6', isSheet && 'max-sm:flex')}", known2);
    expect(lists).toHaveLength(1);
    expect(lists[0]?.tokens).toEqual(['grid', 'p-6', 'max-sm:flex']);
  });

  it('does not read the same class twice when a literal sits inside a className', () => {
    const known2 = new Set(['grid', 'max-sm:flex']);
    expect(classLists("className={cn('grid max-sm:flex')}", known2)).toHaveLength(1);
  });
});

describe('the shared editor keeps each responsive step as a variant', () => {
  // The shell does not @source `frontend/ui/notes`: these utilities ship only in
  // the sheets that do. A bare base beside a breakpoint step can then be won by
  // a sheet appended later on navigation, stripping the step and flipping the
  // composer's toolbar to the wrong side (ADR-0132). `check:layers` only scans
  // shell-compiled files, so the pair is checked here instead.
  const STEPS = new Set([
    'flex-col-reverse',
    'max-sm:flex-col-reverse',
    'sm:flex-col',
    'border-t',
    'max-sm:border-t',
    'sm:border-t-0',
    'sm:border-b',
    'p-4',
    'max-sm:p-4',
    'sm:p-5',
  ]);

  it('never pairs a bare step with a breakpoint step on one element', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'frontend/ui/notes/note-body-editor.tsx'),
      'utf8'
    );
    const offenders = classLists(source, STEPS).flatMap(({ tokens, line }) => {
      const bases = tokens.filter((token) => !token.includes(':'));
      const variants = tokens.filter(
        (token) => token.startsWith('max-sm:') || token.startsWith('sm:')
      );
      return bases.length > 0 && variants.length > 0
        ? [`${line}: ${bases.join(' ')} + ${variants.join(' ')}`]
        : [];
    });

    expect(offenders).toEqual([]);
  });
});
