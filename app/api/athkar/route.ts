import { loadAthkar } from '@/backend/loaders/athkar';

/**
 * The vendored Athkar as one body, for the homepage tab (ADR-0151).
 *
 * The text is a fixed asset read at build time (ADR-0057), so this is a static
 * route: the page's loader and the tab's read cannot disagree about the wording,
 * and neither reads a database.
 */
export const dynamic = 'force-static';

export async function GET() {
  const [morning, evening] = await Promise.all([loadAthkar('morning'), loadAthkar('evening')]);

  return Response.json(
    { morning, evening },
    { headers: { 'Cache-Control': 'public, max-age=3600, s-maxage=86400' } }
  );
}
