// Browser-side Sentry init. Next 16 (Turbopack) loads this file on the client
// automatically — it replaces the old sentry.client.config.ts. No-op when
// NEXT_PUBLIC_SENTRY_DSN is unset so dev runs stay quiet.

import * as Sentry from '@sentry/nextjs';
import { diagnosticPrivacyOptions } from '@udyamflow/env/privacy';

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    ...diagnosticPrivacyOptions,
    tracesSampleRate: 0.1,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
    environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? process.env.NODE_ENV ?? 'development',
  });
}

// Lets Sentry trace App Router navigations.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
