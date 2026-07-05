// Next 16 instrumentation hook — runs once per server start. We use it to
// load the matching Sentry config for whichever runtime is booting (node vs
// edge). If SENTRY_DSN is unset, both configs are no-ops.

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config');
  }
  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config');
  }
}

export { captureRequestError as onRequestError } from '@sentry/nextjs';
