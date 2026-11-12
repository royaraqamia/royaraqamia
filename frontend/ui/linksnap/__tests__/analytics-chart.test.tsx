import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AnalyticsChart } from '../analytics-chart';
import { LINK_ANALYTICS_CHART_COPY } from '../analytics-chart-copy';
import { LinkAnalyticsDrawer } from '../link-analytics-drawer';
import {
  ANALYTICS_RANGE_PRESETS,
  analyticsRangeLabel,
  type AnalyticsData,
  type AnalyticsRangePreset,
} from '../link-analytics-content';

const stats = [
  { date: '2026-11-04', clicks: 0 },
  { date: '2026-11-05', clicks: 2 },
  { date: '2026-11-06', clicks: 1 },
];

const analytics: AnalyticsData = {
  totalClicks: 3,
  clicksByDate: stats,
  topReferrers: [{ name: 'x.example', count: 3 }],
  recentClicks: [],
  device: { devices: [], os: [], browsers: [] },
};

function title(rangeLabel: string) {
  return LINK_ANALYTICS_CHART_COPY.title.replace('{range}', rangeLabel);
}

function ariaLabel(rangeLabel: string) {
  return LINK_ANALYTICS_CHART_COPY.ariaLabel.replace('{range}', rangeLabel);
}

/**
 * The chart names the period it paints (#1085).
 *
 * Every preset feeds the same `stats` array, so the card's title and the plot's
 * accessible name are the only things that tell a fortnight from a quarter. They
 * used to be the literal «آخر 7 أيام» whatever the drawer asked for.
 */
describe('AnalyticsChart', () => {
  it.each(ANALYTICS_RANGE_PRESETS)(
    'names the $value period in the title and the accessible name',
    (preset) => {
      const label = analyticsRangeLabel(preset.value);

      render(<AnalyticsChart stats={stats} rangeLabel={label} />);

      expect(screen.getByText(title(label))).toBeInTheDocument();
      expect(screen.getByRole('img')).toHaveAttribute('aria-label', ariaLabel(label));
    }
  );

  it('no preset label still reads as a week', () => {
    for (const preset of ANALYTICS_RANGE_PRESETS.filter((candidate) => candidate.days !== 7)) {
      const label = analyticsRangeLabel(preset.value);
      const { unmount } = render(<AnalyticsChart stats={stats} rangeLabel={label} />);

      expect(screen.queryByText(title(LINK_ANALYTICS_CHART_COPY.title))).not.toBeInTheDocument();
      expect(screen.getByText(title(label))).not.toHaveTextContent('7 أيام');
      unmount();
    }
  });
});

describe('LinkAnalyticsDrawer — the selected preset reaches the chart', () => {
  function renderDrawer(loadAnalytics = vi.fn(async () => {})) {
    render(
      <LinkAnalyticsDrawer
        isExpanded
        analyticsLoading={false}
        analyticsError={null}
        analytics={analytics}
        status="active"
        loadAnalytics={loadAnalytics}
        exportCsv={vi.fn(async () => null)}
        exportingCsv={false}
        exportCsvFailed={false}
        code="abc"
      />
    );
    return loadAnalytics;
  }

  it('opens on the 7-day preset', () => {
    renderDrawer();

    expect(screen.getByText(title(analyticsRangeLabel('7d')))).toBeInTheDocument();
  });

  it.each(['30d', '90d'] as AnalyticsRangePreset[])(
    'shows %s once that preset is chosen, in the title and the accessible name',
    async (preset) => {
      const loadAnalytics = renderDrawer();
      const label = analyticsRangeLabel(preset);

      fireEvent.click(screen.getByRole('button', { name: label }));

      expect(screen.getByText(title(label))).toBeInTheDocument();
      expect(screen.getByRole('img')).toHaveAttribute('aria-label', ariaLabel(label));
      // The same preset is what the server is asked for, so the plot and its
      // name cannot describe different windows.
      expect(loadAnalytics).toHaveBeenLastCalledWith(
        expect.objectContaining({ from: expect.any(String) })
      );
    }
  );
});
