import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createServerSupabaseClient } from '@/backend/config/supabase';
import { createMcpOAuthProvider } from '@/backend/services/mcp/oauth-provider';
import { Button } from '@/frontend/ui/primitives/button';
import {
  Card,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/frontend/ui/primitives/card';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'ربط MCP',
  description: 'السَّماح لتطبيق خارجي بالوصول إلى بياناتك في رؤية رقمية عبر بروتوكول MCP.',
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
    const loginUrl = new URL('/auth/login', process.env.NEXT_PUBLIC_BASE_URL ?? '');
    loginUrl.searchParams.set(
      'redirect',
      `/mcp/connect?client_id=${encodeURIComponent(
        clientId!
      )}&redirect_uri=${encodeURIComponent(redirectUri!)}&scope=${encodeURIComponent(
        scope
      )}&state=${encodeURIComponent(state)}&code_challenge=${encodeURIComponent(
        codeChallenge!
      )}&code_challenge_method=${encodeURIComponent(codeChallengeMethod!)}`
    );
    redirect(loginUrl.pathname + loginUrl.search);
  }

  return (
    <main className="min-h-dvh flex items-center justify-center p-4 sm:p-6 bg-background text-foreground">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>السَّماح بالوصول</CardTitle>
          <CardDescription>
            يطلب تطبيق «{client.client_name ?? 'MCP'}» الوصول إلى بياناتك في رؤية رقمية.
          </CardDescription>
        </CardHeader>
        <CardFooter>
          <form method="POST" action="/mcp/connect/consent" className="w-full space-y-3">
            <input type="hidden" name="client_id" value={clientId} />
            <input type="hidden" name="redirect_uri" value={redirectUri} />
            <input type="hidden" name="scope" value={scope} />
            <input type="hidden" name="state" value={state} />
            <input type="hidden" name="code_challenge" value={codeChallenge} />
            <input type="hidden" name="code_challenge_method" value={codeChallengeMethod} />
            <Button
              type="submit"
              name="action"
              value="approve"
              className="w-full"
              variant="default"
            >
              السَّماح
            </Button>
            <Button type="submit" name="action" value="deny" className="w-full" variant="outline">
              رفض
            </Button>
          </form>
        </CardFooter>
      </Card>
    </main>
  );
}
