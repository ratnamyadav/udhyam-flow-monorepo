import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

// Exercise the actual CommonJS consumer used by Expo linking, not a copy
// of the decoder. Upgrading the decoder to ESM would break this call path.
const mobileRequire = createRequire(new URL('../../../apps/mobile/package.json', import.meta.url));
const linkingRequire = createRequire(mobileRequire.resolve('expo-linking'));
const queryString = linkingRequire('query-string') as {
  parse(input: string): Record<string, string>;
};

describe('Expo deep-link percent decoding security', () => {
  it('preserves CommonJS query parsing and valid UTF-8', () => {
    expect(queryString.parse('name=Gurugram%20Studio&symbol=%E2%9C%93')).toMatchObject({
      name: 'Gurugram Studio',
      symbol: '✓',
    });
  });
  it('handles large malformed byte runs without exponential recursion', () => {
    const malformed = '%FF'.repeat(10000);
    expect(queryString.parse(`value=${malformed}`).value).toBe(malformed);
  }, 5000);
});
