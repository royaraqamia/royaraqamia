import * as Sentry from '@sentry/nextjs';
import { appVersion } from '@/backend/config/generated/app-version';

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.VERCEL_ENV || process.env.NODE_ENV || 'development',
  release: appVersion.releaseVersion,
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 0,
});
