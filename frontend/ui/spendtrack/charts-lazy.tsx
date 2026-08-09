'use client';

import dynamic from 'next/dynamic';

export const CategoryPieChartLazy = dynamic(
  () => import('./category-pie-chart').then((m) => m.CategoryPieChart),
  { ssr: false }
);

export const DailyBarChartLazy = dynamic(
  () => import('./daily-bar-chart').then((m) => m.DailyBarChart),
  { ssr: false }
);
