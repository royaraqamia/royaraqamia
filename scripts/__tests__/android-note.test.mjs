import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  NOTE_PREFIXES,
  bulletProblem,
  collectBullets,
  formatBullet,
  normalizeBullet,
  noteFilename,
  pendingFragments,
  renderFragment,
  writeFragment,
} from '../android-note.mjs';

const dirs = [];

function tempDir() {
  const dir = mkdtempSync(join(tmpdir(), 'android-note-'));
  dirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('one release note', () => {
  it('drops a list marker and folds whitespace', () => {
    expect(normalizeBullet('-   ميزة:   شيء   جديد ')).toBe('ميزة: شيء جديد');
  });

  it('accepts the three categories the changelog uses', () => {
    for (const prefix of NOTE_PREFIXES) {
      expect(bulletProblem(`${prefix}: شيء يراه المستخدم`)).toBeNull();
    }
  });

  it('refuses anything else, and says how to fix it', () => {
    expect(bulletProblem('fix(android): keep the queue')).toMatch(/not Arabic/);
    expect(bulletProblem('ميزة: ')).toMatch(/says nothing after its prefix/);
    expect(bulletProblem('')).toMatch(/is empty/);
    expect(bulletProblem('إصلاح بدون نقطتين')).toMatch(/does not start with/);
  });

  it('normalises the spacing after the colon', () => {
    expect(formatBullet('ميزة :   الكاميرا')).toBe('ميزة: الكاميرا');
    expect(formatBullet('إصلاح:  التحديث')).toBe('إصلاح: التحديث');
  });

  it('de-duplicates lines a person wrote twice', () => {
    expect(collectBullets(['ميزة: الكاميرا', 'ميزة: الكاميرا', 'إصلاح: التحديث'])).toEqual([
      'ميزة: الكاميرا',
      'إصلاح: التحديث',
    ]);
  });
});

describe('the fragment file', () => {
  it('is named after the slug when given one, and lower-case ASCII', () => {
    expect(noteFilename({ slug: 'Camera Fix' })).toBe('camera-fix.md');
    expect(() => noteFilename({ slug: '!!!' })).toThrow(/no usable letters/);
  });

  it('falls back to a UTC stamp that cannot collide', () => {
    const name = noteFilename({ now: new Date('2026-11-02T06:07:08Z') });
    expect(name).toBe('note-20261102-060708.md');
  });

  it('stores one list item per bullet', () => {
    expect(renderFragment(['ميزة: الكاميرا', 'إصلاح: التحديث'])).toBe(
      '- ميزة: الكاميرا\n- إصلاح: التحديث\n'
    );
  });

  it('writes the fragment, and refuses to overwrite one', () => {
    const dir = tempDir();
    const path = writeFragment({
      dir,
      filename: 'camera.md',
      bullets: ['ميزة: الكاميرا'],
    });

    expect(readFileSync(path, 'utf8')).toBe('- ميزة: الكاميرا\n');
    expect(() => writeFragment({ dir, filename: 'camera.md', bullets: ['ميزة: أخرى'] })).toThrow(
      /already exists/
    );
  });

  it('lists only real notes, never the folder README', () => {
    const dir = tempDir();
    writeFragment({ dir, filename: 'camera.md', bullets: ['ميزة: الكاميرا'] });
    writeFileSync(join(dir, '_README.md'), 'not a note\n');

    expect(pendingFragments(dir)).toEqual(['camera.md']);
  });
});
