import type {
  ScanHistoryRepository,
  ScanHistoryRow,
} from '@/backend/repositories/scan-history/scan-history-repository';
import {
  SCAN_HISTORY_LIMIT,
  ScanHistoryKindSchema,
  type ScanHistoryEntry,
  type ScanHistoryRecord,
} from '@/shared/contracts/scan-history';

/**
 * The scan history's rules, above the table (#1430, ADR-0205).
 *
 * The service adds the one thing the row does not carry: the day the code was
 * last read, in the member's own clock (Damascus), so the site and the app print
 * the same date without either of them owning a time zone. Everything else - the
 * dedupe, the retention, the cap - belongs to the database, because a rule the
 * service enforces is a rule a second writer can skip.
 */

export interface ScanHistoryServiceDeps {
  scanHistory: ScanHistoryRepository;
}

export class ScanHistoryService {
  constructor(private readonly deps: ScanHistoryServiceDeps) {}

  /** The member's history, newest read first. */
  async list(userId: string): Promise<ScanHistoryEntry[]> {
    const rows = await this.deps.scanHistory.list(userId, SCAN_HISTORY_LIMIT);
    return rows.map(toEntry);
  }

  /** Where the code now sits in the history, after this read. */
  async record(input: ScanHistoryRecord): Promise<ScanHistoryEntry> {
    return toEntry(await this.deps.scanHistory.record(input));
  }

  /** Delete every row the member owns. Answers how many went. */
  async clear(userId: string): Promise<number> {
    return this.deps.scanHistory.clear(userId);
  }
}

/**
 * The day is formatted on the server rather than in either client: two
 * `Intl`/`java.time` implementations of "the Damascus day" is two chances to
 * disagree about a row that was read at 23:50.
 */
const DAMASCUS_DAY = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Damascus',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

function damascusDate(iso: string): string {
  return DAMASCUS_DAY.format(new Date(iso)).replace(/-/g, '/');
}

function toEntry(row: ScanHistoryRow): ScanHistoryEntry {
  const kind = ScanHistoryKindSchema.safeParse(row.kind);
  if (!kind.success) {
    // A kind outside the Scanner's vocabulary is a write that bypassed the
    // function. It is a data-integrity failure, not a row to render.
    throw new Error(`scan history row ${row.id} has an unknown kind "${row.kind}"`);
  }

  return {
    id: row.id,
    kind: kind.data,
    format: row.format,
    label: row.label,
    lastSeenDate: damascusDate(row.lastSeenAt),
    lastSeenAt: row.lastSeenAt,
    seenCount: row.seenCount,
  };
}
