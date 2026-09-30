import * as Sentry from '@sentry/nextjs';

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    tracesSampleRate: 0.1,
    environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? process.env.NODE_ENV ?? 'development',
  });
}

// Browser Sentry must live in instrumentation-client.ts under Turbopack —
// the old sentry.client.config.ts is only picked up by the webpack plugin.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
