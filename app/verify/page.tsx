import { VerifySurface } from '@/frontend/ui/verify/verify-surface';

/**
 * `/verify` is the certificate check, a root of the app door (ADR-0146).
 *
 * The surface is shared with the homepage host, which draws the same component
 * under the strip (ADR-0151): one implementation, so a state added here cannot
 * be missing from the tab.
 */
export default function VerifyPage() {
  return <VerifySurface />;
}
