import assert from 'node:assert/strict';
import fs from 'node:fs';
import { chromium } from 'playwright-core';

const kind = process.argv[2];
const port = kind === 'web' ? 3192 : 3193;
const base = `http://localhost:${port}`;
const results = {
  app: kind,
  compiledSource: '85206ab7d906ef746de013e2ffd73d9b4f776e87',
  authHandlerSource: '0508783038cb73dc5405d612a90253195a80c854',
  runtime:
    'Actual prebuilt Next app/shared form and installed BetterAuth client; same-origin browser API bridge to real factory with migrated PGlite and synthetic-only in-memory mail. No production service.',
  checks: [],
  responses: [],
  pageErrors: [],
  dashboardRequests: 0,
};
const browser = await chromium.launch({
  headless: true,
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  args: ['--disable-background-networking', '--disable-component-update', '--disable-sync'],
});
async function makePage() {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  page.on('pageerror', (e) => results.pageErrors.push(e.message));
  await context.route('**/*', async (route) => {
    const req = route.request(),
      url = new URL(req.url());
    if (
      url.origin === base &&
      (url.pathname.startsWith('/api/auth/') || url.pathname.startsWith('/api/trpc/'))
    ) {
      const headers = { ...req.headers() };
      delete headers.host;
      delete headers['content-length'];
      const response = await fetch(`http://localhost:3191${url.pathname}${url.search}`, {
        method: req.method(),
        headers,
        ...(req.postData() ? { body: req.postData() } : {}),
        redirect: 'manual',
      });
      const body = Buffer.from(await response.arrayBuffer());
      if (url.pathname.startsWith('/api/auth/')) {
        let data;
        try {
          data = JSON.parse(body.toString());
        } catch {}
        results.responses.push({
          path: url.pathname,
          status: response.status,
          userPresent: !!data?.user,
          role: data?.user?.role,
          errorCode: data?.code,
        });
      }
      const rh = Object.fromEntries(response.headers);
      const cookies = response.headers.getSetCookie();
      if (cookies.length) rh['set-cookie'] = cookies.join('\n');
      delete rh['content-length'];
      await route.fulfill({ status: response.status, headers: rh, body });
      return;
    }
    if (kind === 'admin' && url.origin === base && url.pathname.startsWith('/dashboard')) {
      results.dashboardRequests++;
      await route.abort('blockedbyclient');
      return;
    }
    if (url.origin !== base) {
      await route.abort('blockedbyclient');
      return;
    }
    await route.continue();
  });
  return { context, page };
}
async function code(email) {
  const data = await (
    await fetch(`http://localhost:3191/fixture/otp?email=${encodeURIComponent(email)}`)
  ).json();
  assert.match(data.code, /^\d{6}$/);
  return data.code;
}
async function verifySession(page, email) {
  const data = await page.evaluate(
    async () => await (await fetch('/api/auth/get-session', { credentials: 'include' })).json(),
  );
  assert.equal(data.user.email, email);
  assert.equal(data.user.emailVerified, true);
  assert.equal(data.user.role, 'user');
  results.checks.push('real cookie session and ordinary role confirmed');
}
async function flow({ signup, email }) {
  const { context, page } = await makePage();
  try {
    await page.goto(
      `${base}/${signup ? 'sign-up' : 'sign-in'}${kind === 'web' ? '?callbackUrl=%2Flegal%2Fprivacy' : ''}`,
      { waitUntil: 'domcontentloaded' },
    );
    await page.getByRole('button', { name: 'Email me a code', exact: true }).waitFor();
    assert.equal(await page.locator('input[type=password]').count(), 0);
    if (signup)
      await page
        .getByRole('textbox', { name: 'Your name', exact: true })
        .fill('Synthetic Web Owner');
    await page.getByRole('textbox', { name: 'Email', exact: true }).fill(email.toUpperCase());
    await page.getByRole('button', { name: 'Email me a code', exact: true }).click();
    await page.getByRole('textbox', { name: '6-digit email code', exact: true }).waitFor();
    assert.equal(await page.getByRole('button', { name: /Resend in/ }).isDisabled(), true);
    assert.equal(
      await page
        .getByRole('textbox', { name: '6-digit email code', exact: true })
        .getAttribute('autocomplete'),
      'one-time-code',
    );
    results.checks.push(
      `${signup ? 'signup' : 'signin'}: actual shared form; normalization; code step; cooldown; autofill`,
    );
    const otp = await code(email);
    await page
      .getByRole('textbox', { name: '6-digit email code', exact: true })
      .fill(otp === '000000' ? '000001' : '000000');
    await page.getByRole('button', { name: 'Verify and continue', exact: true }).click();
    await page
      .getByText('Unable to verify this code. Check it or request a new one.', { exact: true })
      .waitFor();
    results.checks.push('generic wrong-code recovery');
    await page.getByRole('textbox', { name: '6-digit email code', exact: true }).fill(otp);
    const verified = page.waitForResponse((r) => r.url().endsWith('/api/auth/sign-in/email-otp'));
    await page.getByRole('button', { name: 'Verify and continue', exact: true }).click();
    assert.equal((await verified).status(), 200);
    if (kind === 'web') {
      await page.waitForURL(/\/legal\/privacy/);
      results.checks.push('actual safe callback navigation');
      await page.reload({ waitUntil: 'domcontentloaded' });
      await verifySession(page, email);
      results.checks.push('browser reload persistence');
    } else {
      await page.waitForTimeout(1200);
      assert.ok(results.dashboardRequests > 0);
      await page.goto(`${base}/sign-in`, { waitUntil: 'domcontentloaded' });
      await page.getByRole('button', { name: 'Email me a code', exact: true }).waitFor();
      await verifySession(page, email);
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.getByRole('button', { name: 'Email me a code', exact: true }).waitFor();
      await verifySession(page, email);
      results.checks.push('admin cookie session survives actual sign-in-page reload');
      results.checks.push(
        'admin onSuccess invokes /dashboard navigation; dashboard network intentionally aborted before production DB dependency',
      );
    }
    const reused = await page.evaluate(
      async ({ email, otp }) =>
        (
          await fetch('/api/auth/sign-in/email-otp', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ email, otp }),
          })
        ).status,
      { email, otp },
    );
    assert.equal(reused, 400);
    results.checks.push('consumed code rejected through browser client transport');
  } finally {
    await context.close();
  }
}
try {
  if (kind === 'web') {
    await flow({ signup: true, email: 'new-owner@example.test' });
    await flow({ signup: false, email: 'resend@example.test' });
  } else await flow({ signup: false, email: 'asha@example.test' });
  assert.equal(results.pageErrors.length, 0);
  results.result = 'PASS';
  results.exclusions = [
    'Real inbox delivery',
    'Timed browser expiry/resend rotation (covered separately by Expo browser and real-handler tests)',
    'Actual admin dashboard server role gate: requires configured PostgreSQL/Neon DATABASE_URL; no production connection used',
  ];
  console.log(JSON.stringify(results, null, 2));
  fs.writeFileSync(
    `/tmp/udyamflow-next-${kind}-form-verification.json`,
    `${JSON.stringify(results, null, 2)}\n`,
  );
} catch (e) {
  console.log(JSON.stringify({ ...results, result: 'FAIL', failure: e.message }, null, 2));
  throw e;
} finally {
  await browser.close();
}
