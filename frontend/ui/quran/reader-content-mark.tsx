'use client';

import { useEffect } from 'react';

import { markContent } from '@/frontend/shared/perf-marks';

/**
 * The sura's text is server-rendered, so no Local Store hook marks it as content.
 * Without this the reader cannot enter the paint gate (#558): the row in
 * `perf/paint-budget.json` would report "no cold content mark" forever. The mark
 * is the layout's own `boot → content` measure, taken after the frame that shows
 * the Ayat; this component draws nothing and changes no box.
 */
export function ReaderContentMark() {
  useEffect(() => markContent(), []);
  return null;
}
