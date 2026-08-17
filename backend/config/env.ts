import { appVersion } from '@/backend/config/generated/app-version';

const FALLBACK_SITE_URL = 'https://royaraqamia.com';

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
  get siteUrl(): string {
    return read('NEXT_PUBLIC_SITE_URL') ?? FALLBACK_SITE_URL;
  },
  get baseUrl(): string {
    return read('NEXT_PUBLIC_BASE_URL') ?? FALLBACK_SITE_URL;
  },
  get appUrl(): string | undefined {
    return read('APP_URL');
  },
  get version(): string {
    return (
      read('VERCEL_DEPLOYMENT_ID') ||
      read('VERCEL_GIT_COMMIT_SHA') ||
      read('NEXT_BUILD_ID') ||
      'unknown'
    );
  },
  get releaseVersion(): string {
    return appVersion.releaseVersion;
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
  get pushEndpointAllowlist(): string[] {
    const raw = read('PUSH_ENDPOINT_ALLOWLIST')?.trim();
    return (raw && raw.length > 0 ? raw : DEFAULT_PUSH_ENDPOINT_ALLOWLIST)
      .split(',')
      .map((e) => e.trim())
      .filter((e) => e.length > 0);
  },
};
