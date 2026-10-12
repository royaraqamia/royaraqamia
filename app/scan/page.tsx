import { ScanPage } from '@/frontend/ui/scan/scan-page';

// The Scanner owns no server surface (ADR-0034): decoding happens on the device,
// so this route is fully static and costs only static bytes.
export const dynamic = 'force-static';

export default function ScanRoute() {
  return <ScanPage />;
}
