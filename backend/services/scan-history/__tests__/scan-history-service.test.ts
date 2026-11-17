import { describe, expect, it, vi } from 'vitest';

import type {
  ScanHistoryRepository,
  ScanHistoryRow,
} from '@/backend/repositories/scan-history/scan-history-repository';
import { ScanHistoryService } from '@/backend/services/scan-history/scan-history-service';

/**
 * The service is the seam that turns a row into what both clients draw (#1430).
 *
 * Two things are worth pinning here: the day is the Damascus day rather than the
 * server's UTC one, and a row whose kind the Scanner does not have is a failure
 * rather than a row mislabelled in the list.
 */

function repository(overrides: Partial<ScanHistoryRepository> = {}): ScanHistoryRepository {
  return {
    list: vi.fn(async () => []),
    record: vi.fn(),
    clear: vi.fn(async () => 0),
    ...overrides,
  } as ScanHistoryRepository;
}

function row(overrides: Partial<ScanHistoryRow> = {}): ScanHistoryRow {
  return {
    id: 'row-1',
    kind: 'link',
    format: 'qr_code',
    label: 'cafe.example',
    createdAt: '2026-12-01T09:00:00.000Z',
    lastSeenAt: '2026-12-12T20:30:00.000Z',
    seenCount: 2,
    ...overrides,
  };
}

describe('ScanHistoryService', () => {
  it('maps a row to the entry both clients draw', async () => {
    const service = new ScanHistoryService({
      scanHistory: repository({ list: async () => [row()] }),
    });

    expect(await service.list('member-1')).toEqual([
      {
        id: 'row-1',
        kind: 'link',
        format: 'qr_code',
        label: 'cafe.example',
        // 20:30 UTC is 22:30 in Damascus in December: the same day.
        lastSeenDate: '2026/12/12',
        lastSeenAt: '2026-12-12T20:30:00.000Z',
        seenCount: 2,
      },
    ]);
  });

  it('reads the Damascus day, not the server day', async () => {
    const service = new ScanHistoryService({
      scanHistory: repository({
        // 22:30 UTC on the 12th is already the 13th in Damascus (+03:00).
        list: async () => [row({ lastSeenAt: '2026-12-12T22:30:00.000Z' })],
      }),
    });

    const [entry] = await service.list('member-1');
    expect(entry?.lastSeenDate).toBe('2026/12/13');
  });

  it('refuses a row whose kind the Scanner does not have', async () => {
    const service = new ScanHistoryService({
      scanHistory: repository({ list: async () => [row({ kind: 'card' })] }),
    });

    await expect(service.list('member-1')).rejects.toThrow(/unknown kind "card"/);
  });

  it('asks the repository for the capped page, and clears what it owns', async () => {
    const list = vi.fn(async () => [] as ScanHistoryRow[]);
    const clear = vi.fn(async () => 3);
    const service = new ScanHistoryService({ scanHistory: repository({ list, clear }) });

    await service.list('member-1');
    expect(list).toHaveBeenCalledWith('member-1', 200);
    expect(await service.clear('member-1')).toBe(3);
    expect(clear).toHaveBeenCalledWith('member-1');
  });
});
