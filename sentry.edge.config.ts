import * as Sentry from '@sentry/nextjs';
import { appVersion } from '@/backend/config/generated/app-version';

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.VERCEL_ENV || process.env.NODE_ENV || 'development',
  release: appVersion.releaseVersion,
  // Tracing wraps every instrumented request in spans, which is CPU the Hobby
  // Fluid Active CPU budget (4h/month) pays for. 1% still surfaces regressions
  // in aggregate without paying for 10% of every render. Error capture is
  // unaffected — it is not sampled.
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.01 : 0,
});
