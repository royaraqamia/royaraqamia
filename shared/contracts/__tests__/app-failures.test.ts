import { describe, expect, it } from 'vitest';

import {
  APP_FAILURE_MAX_FRAMES,
  APP_FAILURE_REASONS_BY_KIND,
  AppFailureReportRequestSchema,
  AppFailureReportSchema,
} from '@/shared/contracts/app-failures';

const SHELL = { name: '1.0.21', code: 20021 };
const CONTRACTS = '05eb4c086b1b';

const crash = {
  version: 1,
  kind: 'crash',
  reason: 'uncaught',
  signature: 'java.lang.IllegalStateException',
  shell: SHELL,
  contracts: CONTRACTS,
  frames: ['com.royaraqamia.app.shell.ShellActivity.onCreate(ShellActivity.kt:121)'],
};

const drain = {
  version: 1,
  kind: 'drain',
  reason: 'refused',
  shell: SHELL,
  contracts: CONTRACTS,
  pending: 0,
  failed: 2,
};

describe('AppFailureReportSchema', () => {
  it('accepts a crash with frames and a drain with counts', () => {
    expect(AppFailureReportRequestSchema.safeParse(crash).success).toBe(true);
    expect(AppFailureReportRequestSchema.safeParse(drain).success).toBe(true);
  });

  it('accepts an ANR, which carries neither frames nor counts', () => {
    const anr = { version: 1, kind: 'anr', reason: 'anr', shell: SHELL, contracts: CONTRACTS };
    expect(AppFailureReportRequestSchema.safeParse(anr).success).toBe(true);
  });

  it('refuses a reason that does not belong to its kind', () => {
    const parsed = AppFailureReportRequestSchema.safeParse({ ...crash, reason: 'refused' });
    expect(parsed.success).toBe(false);
    for (const [kind, reasons] of Object.entries(APP_FAILURE_REASONS_BY_KIND)) {
      expect(reasons.length).toBeGreaterThan(0);
      expect(kind).toMatch(/^(crash|anr|drain)$/);
    }
  });

  it('refuses frames on anything but an uncaught Java crash', () => {
    const parsed = AppFailureReportRequestSchema.safeParse({
      version: 1,
      kind: 'anr',
      reason: 'anr',
      shell: SHELL,
      contracts: CONTRACTS,
      frames: ['a.b(A.kt:1)'],
    });
    expect(parsed.success).toBe(false);
  });

  it('refuses counts on anything but a drain', () => {
    expect(AppFailureReportRequestSchema.safeParse({ ...crash, pending: 1 }).success).toBe(false);
  });

  it('refuses a drain that names nothing it owes', () => {
    expect(
      AppFailureReportRequestSchema.safeParse({
        version: 1,
        kind: 'drain',
        reason: 'abandoned',
        shell: SHELL,
        contracts: CONTRACTS,
      }).success
    ).toBe(false);
  });

  it('refuses a frame that could carry a message or a query string', () => {
    const withQuery = 'com.royaraqamia.app.net.Http.get(Http.kt:31)?token=abc';
    expect(AppFailureReportRequestSchema.safeParse({ ...crash, frames: [withQuery] }).success).toBe(
      false
    );

    const sentence = 'it failed while sending the thing';
    expect(AppFailureReportRequestSchema.safeParse({ ...crash, frames: [sentence] }).success).toBe(
      false
    );
  });

  it('refuses a signature that is a sentence rather than a class name', () => {
    expect(
      AppFailureReportRequestSchema.safeParse({ ...crash, signature: 'boom: token abc' }).success
    ).toBe(false);
  });

  it('caps the frames at the number the app sends', () => {
    const frames = Array.from(
      { length: APP_FAILURE_MAX_FRAMES + 1 },
      (_, index) => `a.b(C.kt:${index})`
    );
    expect(AppFailureReportRequestSchema.safeParse({ ...crash, frames }).success).toBe(false);
  });

  it('refuses a report that is not versioned, or names no contract generation', () => {
    expect(AppFailureReportSchema.safeParse({ ...crash, version: 2 }).success).toBe(false);
    expect(AppFailureReportSchema.safeParse({ ...crash, contracts: 'HEAD' }).success).toBe(false);
  });

  it('refuses a release name that is not the version file’s spelling', () => {
    expect(
      AppFailureReportSchema.safeParse({ ...crash, shell: { name: '1.0.21-debug', code: 1 } })
        .success
    ).toBe(false);
  });
});
