'use client';

import { useEffect, useState } from 'react';
import { DailyClickStat } from '@/domains/linksnap/domain/entities/analytics-event.entity';
import { motion } from 'motion/react';

interface AnalyticsChartProps {
  stats: DailyClickStat[];
}

export function AnalyticsChart({ stats }: AnalyticsChartProps) {
  const [animate, setAnimate] = useState(false);
  const [tooltipBg, setTooltipBg] = useState('15 23 42');

  useEffect(() => {
    const timer = requestAnimationFrame(() => setAnimate(true));
    return () => cancelAnimationFrame(timer);
  }, []);

  useEffect(() => {
    const update = () => {
      setTooltipBg(
        getComputedStyle(document.documentElement).getPropertyValue('--color-on-surface').trim() ||
          '15 23 42'
      );
    };
    update();
    const observer = new MutationObserver(update);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  // If no stats, render empty state
  if (!stats || stats.length === 0) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2, ease: [0.33, 1, 0.68, 1] }}
        className="h-64 flex items-center justify-center bg-slate-50 dark:bg-slate-900/50 rounded-xl border border-dashed border-slate-200 dark:border-slate-700"
      >
        <p className="text-sm text-slate-400 dark:text-slate-500">
          لا توجد بيانات متاحة لهذه الفترة
        </p>
      </motion.div>
    );
  }

  const maxClicks = Math.max(...stats.map((s) => s.clicks), 5);
  const height = 180;
  const width = 500;
  const paddingLeft = 40;
  const paddingRight = 20;
  const paddingTop = 20;
  const paddingBottom = 30;

  const chartWidth = width - paddingLeft - paddingRight;
  const chartHeight = height - paddingTop - paddingBottom;

  const points = stats.map((stat, index) => {
    const t = stats.length === 1 ? 0.5 : index / (stats.length - 1);
    const x = paddingLeft + t * chartWidth;
    const y = paddingTop + chartHeight - (stat.clicks / maxClicks) * chartHeight;
    return { x, y, stat };
  });

  const linePath = points.reduce((path, p, i) => {
    return i === 0 ? `M ${p.x} ${p.y}` : `${path} L ${p.x} ${p.y}`;
  }, '');

  const areaPath =
    points.length > 0
      ? `${linePath} L ${points[points.length - 1]!.x} ${paddingTop + chartHeight} L ${points[0]!.x} ${paddingTop + chartHeight} Z`
      : '';

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: [0.33, 1, 0.68, 1] }}
      className="w-full bg-white dark:bg-slate-800 p-6 rounded-2xl border border-slate-100 dark:border-slate-700 shadow-sm"
    >
      <h4 className="text-sm font-medium text-slate-500 dark:text-slate-400 mb-4 uppercase tracking-wider">
        أداء النقرات (آخر 7 أيام)
      </h4>
      <div className="relative w-full overflow-x-auto">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="w-full min-w-[400px] h-auto overflow-visible"
        >
          <defs>
            <linearGradient id="chart-grad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="rgb(79, 70, 229)" stopOpacity="0.2" />
              <stop offset="100%" stopColor="rgb(79, 70, 229)" stopOpacity="0.0" />
            </linearGradient>
          </defs>

          {/* Grid lines */}
          {[0, 0.25, 0.5, 0.75, 1].map((ratio, i) => {
            const y = paddingTop + chartHeight * ratio;
            const label = Math.round(maxClicks * (1 - ratio));
            return (
              <g key={i} className="opacity-40">
                <line
                  x1={paddingLeft}
                  y1={y}
                  x2={width - paddingRight}
                  y2={y}
                  stroke="currentColor"
                  className="text-slate-200 dark:text-slate-700"
                  strokeWidth="1"
                  strokeDasharray="4 4"
                />
                <text
                  x={paddingLeft - 10}
                  y={y + 4}
                  textAnchor="end"
                  className="text-[10px] font-mono fill-slate-400 dark:fill-slate-500"
                >
                  {label}
                </text>
              </g>
            );
          })}

          {/* Area Fill */}
          {areaPath && (
            <path
              d={
                animate
                  ? areaPath
                  : `M ${points[0]?.x ?? 0} ${paddingTop + chartHeight} L ${points[points.length - 1]?.x ?? 0} ${paddingTop + chartHeight} Z`
              }
              fill="url(#chart-grad)"
              className="transition-all duration-700 ease-out-cubic"
              style={{ transitionTimingFunction: 'var(--ease-out-cubic)' }}
            />
          )}

          {/* Line Path */}
          {linePath && (
            <path
              d={animate ? linePath : `M ${points[0]?.x ?? 0} ${paddingTop + chartHeight}`}
              fill="none"
              stroke="rgb(79, 70, 229)"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="transition-all duration-700 ease-out-cubic"
              style={{ transitionTimingFunction: 'var(--ease-out-cubic)' }}
            />
          )}

          {/* Circle markers and tooltips */}
          {points.map((p, i) => (
            <g key={i} className="group cursor-pointer">
              <circle
                cx={p.x}
                cy={p.y}
                r="4"
                fill="rgb(79, 70, 229)"
                stroke="white"
                strokeWidth="2"
                className="transition-all duration-200"
              />
              {/* Invisible touch target */}
              <circle cx={p.x} cy={p.y} r="12" fill="transparent" />
              {/* Tooltip on Hover */}
              <g className="opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none">
                <rect
                  x={Math.max(p.x - 35, paddingLeft)}
                  y={p.y - 32}
                  width="70"
                  height="22"
                  rx="4"
                  fill={`rgb(${tooltipBg})`}
                />
                <text
                  x={Math.max(p.x, paddingLeft + 35)}
                  y={p.y - 17}
                  textAnchor="middle"
                  fill="white"
                  className="text-[10px] font-mono font-medium"
                >
                  {p.stat.clicks} نقرة
                </text>
              </g>
            </g>
          ))}

          {/* Date Labels */}
          {stats.map((stat, index) => {
            const t = stats.length === 1 ? 0.5 : index / (stats.length - 1);
            const x = paddingLeft + t * chartWidth;
            // Format to show 'Jul 8'
            const dateParts = stat.date.split('-');
            const labelStr =
              dateParts.length === 3
                ? `${new Date(Number(dateParts[0]), Number(dateParts[1]) - 1, Number(dateParts[2])).toLocaleDateString('ar-EG', { month: 'short', day: 'numeric' })}`
                : stat.date;

            return (
              <text
                key={index}
                x={x}
                y={height - 10}
                textAnchor="middle"
                className="text-[9px] font-medium fill-slate-400 dark:fill-slate-500 font-mono"
              >
                {labelStr}
              </text>
            );
          })}
        </svg>
      </div>
    </motion.div>
  );
}
