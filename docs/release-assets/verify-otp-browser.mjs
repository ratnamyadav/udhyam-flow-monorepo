import assert from 'node:assert/strict';
import fs from 'node:fs';
import { chromium } from 'playwright-core';

const out = '/tmp/udyamflow-otp-web-captures';
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  args: ['--disable-background-networking', '--disable-component-update', '--disable-sync'],
});
const page = await browser.newPage({ viewport: { width: 360, height: 640 }, deviceScaleFactor: 3 });
page.on('response', async (r) => {
  if (r.url().includes('/api/auth/')) {
    const h = await r.allHeaders();
    const data = await r.json().catch(() => null);
    console.log(
      'AUTH',
      new URL(r.url()).pathname,
      r.status(),
      'setCookiePresent',
      !!h['set-cookie'],
      'errorCode',
      data?.code,
      'hasUser',
      !!data?.user,
    );
  }
});
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
try {
  await page.goto('http://localhost:8091/sign-in', {
    waitUntil: 'domcontentloaded',
    timeout: 120000,
  });
  await page.getByRole('button', { name: 'Email me a code' }).waitFor({ timeout: 120000 });
  assert.equal(await page.locator('input[type="password"]').count(), 0);
  await page.screenshot({ path: `${out}/expo-web-phone-email-sign-in-1080x1920.png` });
  await page.getByRole('link', { name: 'Create an account' }).click();
  await page.getByRole('textbox', { name: 'Your name', exact: true }).fill('Asha Mehra');
  await page.getByRole('textbox', { name: 'Email', exact: true }).fill('new-owner@example.test');
  await page.screenshot({ path: `${out}/expo-web-phone-email-sign-up-1080x1920.png` });
  await page.getByRole('button', { name: 'Email me a code' }).click();
  await page
    .getByText('Enter the code sent to new-owner@example.test.', { exact: true })
    .waitFor({ timeout: 30000 });
  await page.screenshot({ path: `${out}/expo-web-phone-email-code-1080x1920.png` });
  assert.match(await page.getByRole('button', { name: /Resend in/ }).innerText(), /Resend in \d+s/);
  assert.equal(await page.getByRole('button', { name: /Resend in/ }).isDisabled(), true);
  await page.getByRole('button', { name: 'Change email / Back' }).click();
  assert.equal(
    await page.getByRole('textbox', { name: 'Email', exact: true }).inputValue(),
    'new-owner@example.test',
  );
  await page.getByRole('textbox', { name: 'Email', exact: true }).fill('resend@example.test');
  await page.getByRole('button', { name: 'Email me a code' }).click();
  await page
    .getByText('Enter the code sent to resend@example.test.', { exact: true })
    .waitFor({ timeout: 30000 });
  await page.waitForTimeout(61_000);
  const oldResponse = await fetch('http://127.0.0.1:3191/fixture/otp?email=resend%40example.test');
  const oldCode = (await oldResponse.json()).code;
  await page.getByRole('button', { name: 'Resend code', exact: true }).click();
  await page.getByRole('button', { name: /Resend in/ }).waitFor();
  await page.getByRole('textbox', { name: '6-digit email code', exact: true }).fill(oldCode);
  await page.getByRole('button', { name: 'Verify and continue' }).click();
  await page
    .getByText('Unable to verify this code. Check it or request a new one.', { exact: true })
    .waitFor();
  const response = await fetch('http://127.0.0.1:3191/fixture/otp?email=resend%40example.test');
  const { code } = await response.json();
  assert.match(code, /^\d{6}$/);
  await page
    .getByRole('textbox', { name: '6-digit email code', exact: true })
    .fill(code === '000000' ? '000001' : '000000');
  await page.getByRole('button', { name: 'Verify and continue' }).click();
  await page
    .getByText('Unable to verify this code. Check it or request a new one.', { exact: true })
    .waitFor({ timeout: 30000 });
  await page.getByRole('textbox', { name: '6-digit email code', exact: true }).fill(code);
  const verifiedResponse = page.waitForResponse((r) =>
    r.url().endsWith('/api/auth/sign-in/email-otp'),
  );
  await page.getByRole('button', { name: 'Verify and continue' }).click();
  const result = await verifiedResponse;
  console.log('VERIFIED STATUS', result.status());
  console.log(
    'COOKIE FLAGS',
    (await page.context().cookies()).map(({ name, domain, path, httpOnly, secure, sameSite }) => ({
      name,
      domain,
      path,
      httpOnly,
      secure,
      sameSite,
    })),
  );
  await page.waitForURL(/no-organization/, { timeout: 30000 });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForURL(/no-organization/, { timeout: 30000 });
  const reused = await page.request.post('http://localhost:3191/api/auth/sign-in/email-otp', {
    headers: { origin: 'http://localhost:8091' },
    data: { email: 'resend@example.test', otp: code, name: 'Asha Mehra' },
  });
  assert.equal(reused.status(), 400);
  await page.getByText('Sign out', { exact: true }).click();
  await page.waitForURL(/sign-in/);
  await page.getByRole('link', { name: 'Open the booking flow →' }).click();
  await page.getByText('Where are you booking?', { exact: true }).waitFor();
  assert.equal(errors.length, 0);
  fs.writeFileSync(
    `${out}/OTP-UI-verification.json`,
    JSON.stringify(
      {
        source: process.argv[2] ?? '0508783038cb73dc5405d612a90253195a80c854',
        result: 'PASS',
        checks: [
          'no password input',
          'signup email/name',
          'code step and resend cooldown',
          'change-email/back',
          'six-digit paste',
          'generic wrong-code recovery',
          'real handler code verification',
          'normal cookie session survives browser reload',
          'resend enables after real 60-second cooldown',
          'rotated code rejected',
          'consumed code rejected',
          'sign out',
          'public guest booking entry',
        ],
        runtime:
          'production Expo-web; actual app UI; synthetic PGlite auth fixture; no real email; not physical native QA',
        pageErrors: errors,
      },
      null,
      2,
    ),
  );
  console.log(
    'PASS: actual production Expo-web email OTP UI, handler verification, recovery and cookie persistence; three screenshots; no page errors; synthetic in-memory mail only.',
  );
} catch (e) {
  console.log('UI ERRORS', errors);
  console.log('CURRENT URL', page.url());
  console.log('BODY', (await page.locator('body').innerText()).slice(0, 1600));
  throw e;
} finally {
  await browser.close();
}
