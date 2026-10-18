'use client';

import dynamic from 'next/dynamic';
import { tolerateChunkFailure } from '../shared/lazy-chunk';

export const CategoryPieChartLazy = dynamic(
  tolerateChunkFailure('category pie chart', () =>
    import('./category-pie-chart').then((m) => ({ default: m.CategoryPieChart }))
  ),
  { ssr: false }
);

export const DailyBarChartLazy = dynamic(
  tolerateChunkFailure('daily bar chart', () =>
    import('./daily-bar-chart').then((m) => ({ default: m.DailyBarChart }))
  ),
  { ssr: false }
);
