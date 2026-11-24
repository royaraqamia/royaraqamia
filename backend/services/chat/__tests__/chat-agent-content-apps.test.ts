import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { chatAgentTool, type ChatAgentToolContext } from '@/backend/services/chat/chat-agent-tools';
import { toolsDepsFor } from '@/backend/services/chat/__tests__/support/tools-deps';
import { ATHKAR_PERIOD_LABELS } from '@/shared/contracts/athkar';
import type { ScanHistoryEntry } from '@/shared/contracts/scan-history';

/**
 * The three content apps' reads (#1430): the Quran's text and its own search
 * asset, the Athkar's two sets, and the summary a scan left behind.
 *
 * What a tool can get wrong here is telling the member something the page would
 * not show them, or handing the model a secret the row never held. Both are
 * pinned: the Quran reads the vendored files the sura page renders, the search
 * reads the asset `check:quran-search` keeps current, and the scan answer carries
 * a label and a count, never a payload.
 */

const { list } = vi.hoisted(() => ({ list: vi.fn() }));

const deps = toolsDepsFor({
  scanHistory: { createService: () => ({ list }) as never },
});

function context(overrides: Partial<ChatAgentToolContext> = {}): ChatAgentToolContext {
  return { userId: 'member-1', supabase: {} as never, ip: '127.0.0.1', deps, ...overrides };
}

function scanEntry(overrides: Partial<ScanHistoryEntry> = {}): ScanHistoryEntry {
  return {
    id: 'row-1',
    kind: 'wifi',
    format: 'qr_code',
    label: 'CafeGuest',
    lastSeenDate: '2026/12/12',
    lastSeenAt: '2026-12-12T20:30:00.000Z',
    seenCount: 2,
    ...overrides,
  };
}

describe('the Quran tools', () => {
  it('answers a verse reference with the verse and its sura', async () => {
    const answer = (await chatAgentTool('get_verse')!.run(
      { surah: 2, ayah: 255 },
      context()
    )) as Record<string, unknown>;

    // The vendored file is the authority on the wording: the tool returns the
    // Mushaf's text, not a retyped copy of it.
    const surah = JSON.parse(
      readFileSync(join(process.cwd(), 'public', 'quran', 'surah', '002.json'), 'utf8')
    ) as { ayahs: string[] };

    expect(answer.found).toBe(true);
    expect(answer.surah).toEqual({ number: 2, name: 'البقرة' });
    expect(answer.ayah).toBe(255);
    expect(answer.ayah_count).toBe(286);
    expect(answer.text).toBe(surah.ayahs[254]);
  });

  it('refuses a verse outside the text rather than inventing one', async () => {
    const answer = await chatAgentTool('get_verse')!.run({ surah: 1, ayah: 8 }, context());

    expect(answer).toEqual({ found: false });
  });

  it('reads a sura in a bounded window and says where the next one starts', async () => {
    const answer = (await chatAgentTool('get_surah')!.run({ surah: 2 }, context())) as {
      from: number;
      to: number;
      truncated: boolean;
      next_from: number | null;
      verses: Array<{ number: number; text: string }>;
    };

    expect(answer.from).toBe(1);
    expect(answer.to).toBe(20);
    expect(answer.verses).toHaveLength(20);
    expect(answer.verses[0]!.number).toBe(1);
    expect(answer.truncated).toBe(true);
    expect(answer.next_from).toBe(21);
  });

  it('lists the 114 suras in the order of the text', async () => {
    const answer = (await chatAgentTool('list_surahs')!.run({}, context())) as {
      count: number;
      surahs: Array<{ number: number; name: string; ayahCount: number }>;
    };

    expect(answer.count).toBe(114);
    expect(answer.surahs[0]).toMatchObject({ number: 1, name: 'الفاتحة', ayahCount: 7 });
    expect(answer.surahs[113]!.number).toBe(114);
  });

  it("searches the page's own asset, not a second index", async () => {
    const answer = (await chatAgentTool('search_quran')!.run(
      { query: 'إياك نعبد', limit: 3 },
      context()
    )) as {
      total: number;
      hits: Array<{ surah: { number: number; name: string }; ayah: number; text: string }>;
    };

    expect(answer.total).toBeGreaterThan(0);
    expect(answer.hits.length).toBeGreaterThan(0);
    expect(answer.hits[0]!.surah.number).toBe(1);
    expect(answer.hits[0]!.ayah).toBe(5);
    expect(answer.hits[0]!.text).toContain('نَعْبُدُ');
  });

  it('answers nothing for a query of diacritics alone', async () => {
    const answer = (await chatAgentTool('search_quran')!.run({ query: 'ِِِ' }, context())) as {
      total: number;
      hits: unknown[];
    };

    expect(answer.total).toBe(0);
    expect(answer.hits).toEqual([]);
  });
});

describe('the Athkar tools', () => {
  it("lists the two sets with the page's names and counts", async () => {
    const answer = (await chatAgentTool('list_athkar_sets')!.run({}, context())) as {
      sets: Array<{ period: string; label: string; count: number }>;
    };

    expect(answer.sets.map((set) => set.period)).toEqual(['morning', 'evening']);
    expect(answer.sets[0]!.label).toBe(ATHKAR_PERIOD_LABELS.morning);
    expect(answer.sets[0]!.count).toBeGreaterThan(0);
  });

  it("returns a set with every item's text, repeat and source", async () => {
    const answer = (await chatAgentTool('get_athkar')!.run({ period: 'morning' }, context())) as {
      found: boolean;
      period: string;
      items: Array<{ text: string; repeat: number; source: { label: string; ref: string } }>;
    };

    expect(answer.found).toBe(true);
    expect(answer.period).toBe('morning');
    expect(answer.items.length).toBeGreaterThan(0);
    for (const item of answer.items) {
      expect(item.text.length).toBeGreaterThan(0);
      expect(item.repeat).toBeGreaterThanOrEqual(1);
      expect(item.source.ref.length).toBeGreaterThan(0);
    }
  });
});

describe('the scan history tool', () => {
  it("answers the member's own rows as a summary", async () => {
    list.mockResolvedValueOnce([scanEntry()]);

    const answer = (await chatAgentTool('get_scan_history')!.run({}, context())) as {
      count: number;
      entries: Array<Record<string, unknown>>;
    };

    expect(list).toHaveBeenCalledWith('member-1');
    expect(answer.count).toBe(1);
    expect(answer.entries[0]).toEqual({
      kind: 'wifi',
      kind_label: 'شبكة WiFi',
      label: 'CafeGuest',
      last_seen_date: '2026/12/12',
      seen_count: 2,
    });
  });

  it('says the history is empty rather than answering a bare list', async () => {
    list.mockResolvedValueOnce([]);

    const answer = (await chatAgentTool('get_scan_history')!.run({}, context())) as {
      count: number;
      entries: unknown[];
      note: string | null;
    };

    expect(answer.count).toBe(0);
    expect(answer.entries).toEqual([]);
    expect(answer.note).toContain('لا سجل مسح');
  });

  it('bounds the list the caller asks for', async () => {
    list.mockResolvedValueOnce(
      Array.from({ length: 5 }, (_, index) => scanEntry({ id: `row-${index}` }))
    );

    const answer = (await chatAgentTool('get_scan_history')!.run({ limit: 2 }, context())) as {
      count: number;
      entries: unknown[];
    };

    expect(answer.count).toBe(5);
    expect(answer.entries).toHaveLength(2);
  });
});
