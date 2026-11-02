import { describe, expect, it, vi } from 'vitest';

import { AppFailureService } from '@/backend/services/observability/app-failure-service';
import type { AppFailureReport } from '@/shared/contracts/app-failures';

const SHELL = { name: '1.0.21', code: 20021 };

function report(overrides: Partial<AppFailureReport> = {}): AppFailureReport {
  return {
    version: 1,
    kind: 'crash',
    reason: 'uncaught',
    signature: 'java.lang.IllegalStateException',
    shell: SHELL,
    contracts: '05eb4c086b1b',
    ...overrides,
  } as AppFailureReport;
}

function service() {
  const capture = vi.fn();
  return { capture, failures: new AppFailureService({ failures: { capture } }) };
}

describe('AppFailureService', () => {
  it('files one issue per class, naming the release and the contracts', () => {
    const { capture, failures } = service();
    failures.record(report({ frames: ['com.royaraqamia.app.Shell.onCreate(Shell.kt:9)'] }));

    expect(capture).toHaveBeenCalledWith('[app-failure] crash/uncaught', {
      level: 'error',
      fingerprint: ['app-failure', 'crash', 'uncaught'],
      tags: {
        'app.kind': 'crash',
        'app.reason': 'uncaught',
        'app.shell': '1.0.21',
        'app.shell.code': '20021',
        'app.contracts': '05eb4c086b1b',
      },
      extra: {
        signature: 'java.lang.IllegalStateException',
        frames: ['com.royaraqamia.app.Shell.onCreate(Shell.kt:9)'],
        pending: null,
        failed: null,
        at: null,
      },
    });
  });

  it('reports a failed drain as a warning, with its counts and no frames', () => {
    const { capture, failures } = service();
    failures.record(report({ kind: 'drain', reason: 'refused', pending: 0, failed: 3 }));

    const [, context] = capture.mock.calls[0] ?? [];
    expect(context.level).toBe('warning');
    expect(context.extra).toMatchObject({ pending: 0, failed: 3, frames: null });
  });

  it('drops a frame that names a credential, whatever the schema let through', () => {
    const { capture, failures } = service();
    failures.record(
      report({
        frames: [
          'com.royaraqamia.app.Shell.onCreate(Shell.kt:9)',
          'com.royaraqamia.app.Http.send(Authorization.bearer:1)',
          'com.royaraqamia.app.Session.refresh(refresh_token:2)',
        ],
      })
    );

    const [, context] = capture.mock.calls[0] ?? [];
    expect(context.extra.frames).toEqual(['com.royaraqamia.app.Shell.onCreate(Shell.kt:9)']);
  });

  it('sends no frames at all when every one of them was dropped', () => {
    const { capture, failures } = service();
    failures.record(report({ frames: ['com.royaraqamia.app.Session.refresh(refresh_token:2)'] }));

    const [, context] = capture.mock.calls[0] ?? [];
    expect(context.extra.frames).toBeNull();
  });
});
