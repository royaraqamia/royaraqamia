import './globals.css';
import { SpendTrackLayout } from '@/frontend/ui/spendtrack/spendtrack-layout';

export default function SpendTrackLayoutRoute({ children }: { children: React.ReactNode }) {
  return <SpendTrackLayout>{children}</SpendTrackLayout>;
}
