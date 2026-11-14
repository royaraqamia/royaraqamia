import { appVersion } from '@/backend/config/generated/app-version';
import { resolveOrigin } from '@/backend/config/origin';

const DEFAULT_PUSH_ENDPOINT_ALLOWLIST =
  '.google.com, fcm.googleapis.com, updates.push.services.mozilla.com, .notify.windows.com, web.push.apple.com';

function read(name: string): string | undefined {
  return process.env[name];
}

export const env = {
  get supabaseUrl(): string | undefined {
    return read('NEXT_PUBLIC_SUPABASE_URL');
  },
  get supabasePublishableKey(): string | undefined {
    return read('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY');
  },
  get supabaseServiceRoleKey(): string | undefined {
    return read('SUPABASE_SERVICE_ROLE_KEY');
  },
  get turnstileSecret(): string | undefined {
    return read('TURNSTILE_SECRET_KEY');
  },
  get pendingLoginSecret(): string | undefined {
    return read('PENDING_LOGIN_SECRET');
  },
  get passwordBreachCheckEnabled(): boolean {
    const raw = read('PASSWORD_BREACH_CHECK_ENABLED');
    if (raw === undefined || raw.trim() === '') return true;
    return !['0', 'false', 'off', 'no'].includes(raw.trim().toLowerCase());
  },
  get resendApiKey(): string | undefined {
    return read('RESEND_API_KEY');
  },
  get resendFromName(): string | undefined {
    return read('RESEND_FROM_NAME');
  },
  get resendFromEmail(): string | undefined {
    return read('RESEND_FROM_EMAIL');
  },
  get upstashRedisUrl(): string | undefined {
    return read('UPSTASH_REDIS_REST_URL');
  },
  get upstashRedisToken(): string | undefined {
    return read('UPSTASH_REDIS_REST_TOKEN');
  },
  get dataDir(): string | undefined {
    return read('DATA_DIR');
  },
  get habitflowSupabaseUrl(): string | undefined {
    return read('SUPABASE_URL') ?? read('NEXT_PUBLIC_SUPABASE_URL');
  },
  /**
   * The site's public origin — the only source of an absolute URL (ADR-0178).
   * Precedence and the production requirement live in `resolveOrigin`.
   */
  get origin(): string {
    return resolveOrigin();
  },
  get version(): string {
    return (
      read('VERCEL_DEPLOYMENT_ID') ||
      read('VERCEL_GIT_COMMIT_SHA') ||
      // Render sets this for a service built from a repo, at build and at
      // runtime; without it `/api/version` answered `unknown` on every deploy
      // (issue #1466).
      read('RENDER_GIT_COMMIT') ||
      read('NEXT_BUILD_ID') ||
      'unknown'
    );
  },
  get releaseVersion(): string {
    return appVersion.releaseVersion;
  },
  get mcpTokenEncryptionKey(): string | undefined {
    return read('MCP_TOKEN_ENCRYPTION_KEY');
  },
  get adminEmails(): string[] {
    return (read('ADMIN_EMAILS') ?? '')
      .split(',')
      .map((e) => e.trim().toLowerCase())
      .filter((e) => e.length > 0);
  },
  get vapidPublicKey(): string | undefined {
    return read('NEXT_PUBLIC_VAPID_PUBLIC_KEY');
  },
  get vapidPrivateKey(): string | undefined {
    return read('VAPID_PRIVATE_KEY');
  },
  get vapidSubject(): string | undefined {
    return read('VAPID_SUBJECT');
  },
  get pushWebhookToken(): string | undefined {
    return read('PUSH_WEBHOOK_TOKEN');
  },
  get fcmProjectId(): string | undefined {
    return read('FCM_PROJECT_ID');
  },
  get fcmClientEmail(): string | undefined {
    return read('FCM_CLIENT_EMAIL');
  },
  /**
   * The Firebase service account's PEM private key. Environment variables cannot
   * carry real newlines, so the value arrives with the literal `\n` escapes the
   * downloaded JSON uses; normalising here keeps every use site from having to
   * remember that.
   */
  get fcmPrivateKey(): string | undefined {
    const raw = read('FCM_PRIVATE_KEY');
    if (raw === undefined || raw.trim() === '') return undefined;
    return raw.includes('\\n') ? raw.replace(/\\n/g, '\n') : raw;
  },
  get cronSecret(): string | undefined {
    return read('CRON_SECRET');
  },
  /**
   * The salt behind a visitor's ledger subject (ADR-0075). It never leaves the
   * server, and rotating it forgets every visitor's 24-hour window — which is
   * the intended effect, not a bug. A deployment that has not set it yet falls
   * back to the MCP encryption key, which is already required to be secret, and
   * finally to a fixed local value so development and tests stay runnable.
   */
  get anonymousIpSalt(): string {
    return (
      read('ANONYMOUS_IP_SALT') ??
      read('MCP_TOKEN_ENCRYPTION_KEY') ??
      'royaraqamia-anonymous-local'
    ).trim();
  },
  get downloaderProviderUrl(): string | undefined {
    return read('DOWNLOADER_PROVIDER_URL');
  },
  get downloaderProviderToken(): string | undefined {
    return read('DOWNLOADER_PROVIDER_TOKEN');
  },
  get downloaderCallbackSecret(): string | undefined {
    return read('DOWNLOADER_CALLBACK_SECRET');
  },
  /**
   * The assistant's provider (ADR-0113, #817). Any OpenAI-compatible endpoint
   * works, so switching vendor is these three values and nothing else: OpenCode's
   * gateway and `deepseek-v4.1-flash` are the defaults — the endpoint and key the
   * agent pipeline already answers with — and another base URL is the escape
   * hatch. `OPENCODE_API_KEY` is the same credential, so a deployment that has it
   * for the workflows does not carry a second copy. A missing key means the
   * assistant is off — the thread stays readable and says so — not broken.
   */
  get aiChatBaseUrl(): string | undefined {
    return read('AI_CHAT_BASE_URL');
  },
  get aiChatModel(): string | undefined {
    return read('AI_CHAT_MODEL');
  },
  get aiChatApiKey(): string | undefined {
    // `??` would stop at an empty value, which is exactly what a cleared
    // variable and the test suite both produce.
    return read('AI_CHAT_API_KEY')?.trim() || read('OPENCODE_API_KEY')?.trim() || undefined;
  },
  get pushEndpointAllowlist(): string[] {
    const raw = read('PUSH_ENDPOINT_ALLOWLIST')?.trim();
    return (raw && raw.length > 0 ? raw : DEFAULT_PUSH_ENDPOINT_ALLOWLIST)
      .split(',')
      .map((e) => e.trim())
      .filter((e) => e.length > 0);
  },
};
