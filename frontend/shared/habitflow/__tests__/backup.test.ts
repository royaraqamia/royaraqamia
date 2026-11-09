import { describe, it, expect } from 'vitest';
import { buildBackupCsv, buildBackupPayload } from '@/frontend/shared/habitflow/backup';
import type { Habit, HabitLog } from '@/shared/contracts/habitflow';

const habits: Habit[] = [
  {
    id: 'h-1',
    name: 'قراءة, يومية',
    frequency: 'daily',
    createdAt: '2026-01-01T00:00:00.000Z',
    archived: false,
    target: 5,
    targetPeriod: 'week',
  },
];

const logs: HabitLog[] = [
  {
    id: 'l-1',
    habitId: 'h-1',
    date: '2026-08-02',
    completed: true,
    completedAt: '2026-08-02T09:00:00.000Z',
    kind: 'complete',
    note: 'ملاحظة "خاصة"',
  },
];

describe('habit backup builders', () => {
  it('wraps habits and logs in a versioned payload', () => {
    const payload = buildBackupPayload(habits, logs);
    expect(payload.version).toBe('1.0');
    expect(payload.exportedAt).toBeDefined();
    expect(payload.habits).toEqual(habits);
    expect(payload.logs).toEqual(logs);
  });

  it('escapes commas and quotes in the CSV', () => {
    const csv = buildBackupCsv(habits, logs);

    expect(csv).toContain('# Habits');
    expect(csv).toContain('# Logs');
    expect(csv).toContain('"قراءة, يومية"');
    expect(csv).toContain('"ملاحظة ""خاصة"""');
  });

  it('defuses a formula-leading name and note', () => {
    const csv = buildBackupCsv(
      [
        {
          id: 'h-1',
          name: '=HYPERLINK("https://evil.example","x")',
          frequency: 'daily',
          createdAt: '2026-01-01T00:00:00.000Z',
          archived: false,
        },
      ],
      [
        {
          id: 'l-1',
          habitId: 'h-1',
          date: '2026-08-02',
          completed: true,
          completedAt: '2026-08-02T09:00:00.000Z',
          note: '=1+1',
        },
      ]
    );

    expect(csv).toContain(`"'=HYPERLINK(""https://evil.example"",""x"")"`);
    expect(csv).toContain(`,'=1+1,`);
  });

  it('defuses every lead a spreadsheet evaluates as a formula', () => {
    for (const lead of ['=', '+', '-', '@']) {
      const csv = buildBackupCsv(
        [
          {
            id: 'h-1',
            name: `${lead}SUM(A1)`,
            frequency: 'daily',
            createdAt: '2026-01-01T00:00:00.000Z',
            archived: false,
          },
        ],
        []
      );

      expect(csv).toContain(`'${lead}SUM(A1)`);
      expect(csv).not.toContain(`,${lead}SUM(A1),`);
    }
  });
});
