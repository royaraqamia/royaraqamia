import '../app.css';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createServerSupabaseClient } from '@/backend/config/supabase';
import { createDefaultMcpOAuthProvider } from '@/backend/config/mcp';
import { effectiveScopes, parseScopes, scopesToLabels } from '@/backend/services/mcp/scope';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/frontend/ui/primitives/card';
import { SectionTitleHighlight } from '@/frontend/ui/shared/section-title';
import { ConnectForm } from './connect-form';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'ربط MCP',
  description: 'السَّماح لتطبيق خارجي بالوصول إلى بياناتك في رؤيَة رقَميَّة عبر بروتوكول MCP.',
};

interface ConnectSearchParams {
  client_id?: string;
  redirect_uri?: string;
  scope?: string;
  state?: string;
  code_challenge?: string;
  code_challenge_method?: string;
}

/** The destination the member is trusting, not the client's self-chosen name. */
function callbackHost(uri: string): string {
  try {
    return new URL(uri).host;
  } catch {
    return uri;
  }
}

/**
 * The consent screen's labels are computed exactly as `/mcp/connect/consent`
 * computes the grant (`parseScopes` then `effectiveScopes`), so a scope the
 * route would drop — `admin` for a non-admin email, an unknown id — is never
 * promised here (#1265). Registration is open (ADR-0022), so the client name is
 * whatever the requester typed: the callback host and the permission list are
 * the facts the member can actually weigh.
 */
export default async function ConnectPage({
  searchParams,
}: {
  searchParams: Promise<ConnectSearchParams>;
}) {
  const params = await searchParams;
  const clientId = params.client_id;
  const redirectUri = params.redirect_uri;
  const scope = params.scope ?? '';
  const state = params.state ?? '';
  const codeChallenge = params.code_challenge;
  const codeChallengeMethod = params.code_challenge_method;

  const provider = createDefaultMcpOAuthProvider();
  const client = clientId ? await provider.getClient(clientId) : null;

  if (!client || !redirectUri || !client.redirect_uris.includes(redirectUri)) {
    redirect('/');
  }
  if (client.expires_at && new Date(client.expires_at).getTime() < Date.now()) {
    redirect('/');
  }
  if (!codeChallenge || codeChallengeMethod !== 'S256') {
    redirect('/');
  }

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    const redirectTo = `/mcp/connect?client_id=${encodeURIComponent(
      clientId!
    )}&redirect_uri=${encodeURIComponent(redirectUri!)}&scope=${encodeURIComponent(
      scope
    )}&state=${encodeURIComponent(state)}&code_challenge=${encodeURIComponent(
      codeChallenge!
    )}&code_challenge_method=${encodeURIComponent(codeChallengeMethod!)}`;
    redirect(`/auth/login?redirect=${encodeURIComponent(redirectTo)}`);
  }

  const granted = effectiveScopes(user.email ?? null, parseScopes(scope));
  const permissionLabels = scopesToLabels(granted);

  return (
    <main className="min-h-dvh flex items-center justify-center p-4 sm:p-6 bg-background text-foreground">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle>
            <SectionTitleHighlight>السَّماح بالوصول</SectionTitleHighlight>
          </CardTitle>
          <CardDescription>
            يطلب تطبيق «{client.client_name ?? 'MCP'}» الوصول إلى بياناتك في رؤيَة رقَميَّة، ثم
            إعادة التَّوجيه إلى{' '}
            <span dir="ltr" className="font-semibold">
              {callbackHost(redirectUri)}
            </span>
            .
          </CardDescription>
        </CardHeader>
        <CardContent>
          {granted.length === 0 ? (
            <p role="alert" className="text-sm text-destructive">
              لا يطلب هذا التَّطبيق أيَّ صلاحيَّة صالحة، لذلك لا يمكن السَّماح له بالوصول.
            </p>
          ) : (
            <section aria-labelledby="mcp-consent-scopes" className="space-y-2">
              <h2 id="mcp-consent-scopes" className="text-sm font-extrabold">
                ما سيُمنح لهذا التَّطبيق
              </h2>
              <ul className="list-disc space-y-1.5 ps-5">
                {permissionLabels.map((label) => (
                  <li key={label} dir="ltr" className="text-start">
                    {label}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </CardContent>
        <CardFooter>
          <ConnectForm
            clientId={clientId!}
            redirectUri={redirectUri}
            scope={scope}
            state={state}
            codeChallenge={codeChallenge}
            codeChallengeMethod={codeChallengeMethod}
            canApprove={granted.length > 0}
          />
        </CardFooter>
      </Card>
    </main>
  );
}
