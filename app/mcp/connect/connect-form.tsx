'use client';

import { usePWAContext } from '@/frontend/ui/PWAProvider';
import { Button } from '@/frontend/ui/primitives/button';
import { HeroCtaButton } from '@/frontend/ui/shared/hero-cta-button';
import { NeedsConnection } from '@/frontend/ui/shared/needs-connection';

interface ConnectFormProps {
  clientId: string;
  redirectUri: string;
  scope: string;
  state: string;
  codeChallenge: string;
  codeChallengeMethod: string;
}

/**
 * The approve/deny pair of the MCP consent screen.
 *
 * The consent is a server POST — the authorization code is minted on the server
 * and the client's redirect is validated there — so a live page that has lost
 * its connection cannot finish the flow. It says that in place, instead of
 * submitting into a browser error page (ADR-0031, #368).
 */
export function ConnectForm({
  clientId,
  redirectUri,
  scope,
  state,
  codeChallenge,
  codeChallengeMethod,
}: ConnectFormProps) {
  const { isOnline } = usePWAContext();

  if (!isOnline) {
    return (
      <NeedsConnection
        variant="inline"
        message="الموافقة على الرَّبط تحتاج إلى اتِّصال بالخادم. تحقَّق من اتِّصالك ثم أعد المحاولة."
      />
    );
  }

  return (
    <form method="POST" action="/mcp/connect/consent" className="w-full space-y-3">
      <input type="hidden" name="client_id" value={clientId} />
      <input type="hidden" name="redirect_uri" value={redirectUri} />
      <input type="hidden" name="scope" value={scope} />
      <input type="hidden" name="state" value={state} />
      <input type="hidden" name="code_challenge" value={codeChallenge} />
      <input type="hidden" name="code_challenge_method" value={codeChallengeMethod} />
      <HeroCtaButton type="submit" name="action" value="approve" className="w-full">
        السَّماح
      </HeroCtaButton>
      <Button type="submit" name="action" value="deny" className="w-full" variant="outline">
        رفض
      </Button>
    </form>
  );
}
