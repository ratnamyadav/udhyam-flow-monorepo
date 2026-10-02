export function validateProductionAuth(env: Record<string, string | undefined>): void {
  if (env.NODE_ENV !== 'production') return;
  const secret = env.BETTER_AUTH_SECRET?.trim();
  if (
    !secret ||
    secret.length < 32 ||
    /^(change.?me|dev.?secret|your.?secret|test.?secret)/i.test(secret)
  ) {
    throw new Error(
      'Production BETTER_AUTH_SECRET must be a unique secret of at least 32 characters.',
    );
  }
  for (const key of [
    'BETTER_AUTH_URL',
    'NEXT_PUBLIC_APP_URL',
    'NEXT_PUBLIC_AUTH_URL',
    'ADMIN_APP_URL',
  ]) {
    const value = env[key];
    if (!value && key === 'ADMIN_APP_URL') continue;
    try {
      const url = new URL(value ?? '');
      if (
        url.protocol !== 'https:' ||
        ['localhost', '127.0.0.1', '::1', '[::1]'].includes(url.hostname) ||
        url.username ||
        url.password
      )
        throw new Error();
    } catch {
      throw new Error(`${key} must be a public HTTPS URL in production.`);
    }
  }
}
