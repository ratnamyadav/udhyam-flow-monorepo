import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { diagnosticPrivacyOptions } from '../../env/src/privacy';

// Load the actual web SDK dependency; the transport below never opens a socket.
const webRequire = createRequire(new URL('../../../apps/web/package.json', import.meta.url));
const Sentry = webRequire('@sentry/nextjs');

describe('deployed diagnostic SDK wiring', () => {
  it('wires the shared error and streaming-span hooks into all six entrypoints', () => {
    for (const app of ['web', 'admin']) {
      for (const file of [
        'instrumentation-client.ts',
        'sentry.server.config.ts',
        'sentry.edge.config.ts',
      ]) {
        const source = readFileSync(
          new URL(`../../../apps/${app}/${file}`, import.meta.url),
          'utf8',
        );
        expect(source).toContain(
          "import { diagnosticPrivacyOptions } from '@udyamflow/env/privacy'",
        );
        expect(source).toMatch(/Sentry\.init\(\{[\s\S]*\.\.\.diagnosticPrivacyOptions/);
      }
    }
    expect(diagnosticPrivacyOptions.traceLifecycle).toBe('stream');
    expect(diagnosticPrivacyOptions.enableLogs).toBe(false);
  });

  it('scrubs real SDK error envelopes and streamed spans while retaining actionable diagnostics', async () => {
    const envelopes: unknown[] = [];
    Sentry.init({
      dsn: 'https://public@example.invalid/1',
      ...diagnosticPrivacyOptions,
      defaultIntegrations: [],
      tracesSampleRate: 1,
      transport: () => ({
        send: async (envelope: unknown) => {
          envelopes.push(envelope);
          return { statusCode: 200 };
        },
        flush: async () => true,
      }),
    });
    try {
      Sentry.captureEvent({
        exception: {
          values: [
            {
              type: 'DatabaseError',
              value: 'SQL private-intake-marker',
              stacktrace: {
                frames: [
                  {
                    filename: 'worker.ts?token=private-token-marker',
                    lineno: 42,
                    vars: { intake: 'private-intake-marker' },
                  },
                ],
              },
            },
          ],
        },
        breadcrumbs: [
          { category: 'fetch', data: { url: '/api/trpc?input=private-token-marker' } },
          { category: 'navigation', data: { to: '/manage-booking?token=private-token-marker' } },
        ],
        extra: { nested: { intake: 'private-intake-marker' } },
        contexts: { customer: { email: 'private-email-marker' } },
      });
      Sentry.startSpan(
        {
          name: 'GET /api/trpc?input=private-token-marker',
          op: 'http.client',
          attributes: {
            'http.request.method': 'GET',
            'http.response.status_code': 503,
            'http.url': '/manage-booking?token=private-token-marker',
            custom: 'private-intake-marker',
          },
        },
        () => {},
      );
      await Sentry.flush(5000);
      const serialized = JSON.stringify(envelopes);
      expect(serialized).not.toMatch(/private-(token|intake|email)-marker/);
      expect(serialized).toContain('DatabaseError');
      expect(serialized).toContain('worker.ts');
      expect(serialized).toContain('42');
      expect(serialized).toContain('GET /api/trpc');
      expect(serialized).toContain('503');
      expect(serialized).toContain('http.client');
      expect(envelopes.length).toBeGreaterThanOrEqual(2);
    } finally {
      await Sentry.close(5000);
    }
  });
});
