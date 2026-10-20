import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createServerSupabaseClient } from '@/backend/config/supabase';
import { createMcpOAuthProvider } from '@/backend/services/mcp/oauth-provider';
import {
  Card,
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

  const provider = createMcpOAuthProvider();
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

  return (
    <main className="min-h-dvh flex items-center justify-center p-4 sm:p-6 bg-background text-foreground">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle>
            <SectionTitleHighlight>السَّماح بالوصول</SectionTitleHighlight>
          </CardTitle>
          <CardDescription>
            يطلب تطبيق «{client.client_name ?? 'MCP'}» الوصول إلى بياناتك في رؤيَة رقَميَّة.
          </CardDescription>
        </CardHeader>
        <CardFooter>
          <ConnectForm
            clientId={clientId!}
            redirectUri={redirectUri}
            scope={scope}
            state={state}
            codeChallenge={codeChallenge}
            codeChallengeMethod={codeChallengeMethod}
          />
        </CardFooter>
      </Card>
    </main>
  );
}
