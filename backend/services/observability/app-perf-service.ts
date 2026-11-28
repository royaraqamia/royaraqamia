import type {
  PerfSample,
  PerfSamplesRepository,
} from '@/backend/repositories/observability/perf-samples-repository';
import type { AppPerfReport } from '@/shared/contracts/app-perf';

/**
 * The beacon's sink (#1885, ADR-0228): the record the contract validated is
 * mapped to the row the table's own shape expects.
 *
 * The mapping is explicit rather than spread, so a field added to the contract
 * does not silently become a column - and a column the kind does not own is
 * `null`, which is what the table's `perf_samples_shape` check reads.
 */
export class AppPerfService {
  constructor(private readonly deps: { samples: PerfSamplesRepository }) {}

  record(report: AppPerfReport): Promise<void> {
    return this.deps.samples.record(toSample(report));
  }
}

export function toSample(report: AppPerfReport): PerfSample {
  const base = {
    platform: report.platform,
    cold: null,
    shellMs: null,
    contentMs: null,
    paintMs: null,
    lcpMs: null,
    cls: null,
    inpMs: null,
    ttfbMs: null,
  };

  if (report.kind === 'launch') {
    return {
      ...base,
      kind: 'launch',
      cold: report.cold,
      shellMs: report.shellMs,
      contentMs: report.contentMs,
    };
  }

  if (report.kind === 'tap') {
    return { ...base, kind: 'tap', paintMs: report.paintMs };
  }

  return {
    ...base,
    kind: 'vitals',
    lcpMs: report.lcpMs,
    cls: report.cls,
    inpMs: report.inpMs,
    ttfbMs: report.ttfbMs,
  };
}
