import * as Sentry from '@sentry/nextjs';
import { diagnosticPrivacyOptions } from '@udyamflow/env/privacy';

const dsn = process.env.SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    ...diagnosticPrivacyOptions,
    tracesSampleRate: 0.1,
    environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? 'development',
  });
}
