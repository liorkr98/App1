import { expect, test, type Page } from '@playwright/test';

import { BASE, PHONE } from './measure';

/**
 * Paying (0049, docs/PAYMENTS.md). The static server has no /api and no
 * Supabase, so both are answered here. What is checked is what the browser
 * may do: point a button at /pay/ only when payments are switched on, frame
 * nothing but Tranzila's own window, and say plainly what went wrong.
 * Whether anyone is PAID is decided on the server (SQL tests, tranzila.test).
 */

const SESSION_KEY = 'sb-yaaqcfcjkfdwtczespny-auth-token';

async function supabase(page: Page, mode: 'off' | 'live' | 'fail', seats: { cohort: string; used: number; cap: number }[] = []) {
  await page.route(/supabase\.co\/rest\/v1\/billing_config/, (route) =>
    mode === 'fail'
      ? route.abort()
      : route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ payments_mode: mode }]) }),
  );
  await page.route(/supabase\.co\/rest\/v1\/cohort_counters/, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(seats) }),
  );
  await page.route(/supabase\.co\/(?!rest\/v1\/(billing_config|cohort_counters))/, (route) => route.abort());
}

async function signIn(page: Page) {
  await page.goto(`${BASE}/`);
  await page.evaluate((key) => {
    const expires = Math.floor(Date.now() / 1000) + 3600;
    localStorage.setItem(key, JSON.stringify({
      access_token: 'a', refresh_token: 'r', token_type: 'bearer', expires_in: 3600, expires_at: expires,
      user: { id: '0f8fad5b-d9cb-469f-a165-70867728950e', aud: 'authenticated', role: 'authenticated', email: 'a@example.test', app_metadata: {}, user_metadata: {}, created_at: '2026-10-19T00:00:00Z' },
    }));
  }, SESSION_KEY);
}

async function checkout(page: Page, body: unknown) {
  await page.route('**/api/payments/checkout', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) }),
  );
}

test.describe('paying', () => {
  test.use({ viewport: PHONE, locale: 'he-IL' });

  test('while payments are off, every plan button still leads to the contact form', async ({ page }) => {
    await supabase(page, 'off');
    await page.goto(`${BASE}/pricing/`, { waitUntil: 'networkidle' });
    const hrefs = await page.locator('a.pr-go[data-pay]').evaluateAll((links) => links.map((a) => a.getAttribute('href')));
    expect(hrefs.length).toBeGreaterThan(0);
    expect(new Set(hrefs)).toEqual(new Set(['/contact/']));
    await expect(page.locator('[data-checkout-off]')).toBeVisible();
  });

  test('an unreadable switch counts as off', async ({ page }) => {
    await supabase(page, 'fail');
    await page.goto(`${BASE}/pricing/`, { waitUntil: 'networkidle' });
    await expect(page.locator('a.pr-go[data-pay]').first()).toHaveAttribute('href', '/contact/');
  });

  test('when live, each card pays for the plan it shows, the launch price only with a seat proven', async ({ page }) => {
    await supabase(page, 'live', [{ cohort: 'agent_launch', used: 10, cap: 200 }]);
    await page.goto(`${BASE}/pricing/`, { waitUntil: 'networkidle' });
    await expect(page.locator('[data-card="agent_launch"] a.pr-go')).toHaveAttribute('href', '/pay/?plan=agent_launch');
    await expect(page.locator('a.pr-go[data-pay="agent_basic"]')).toHaveAttribute('href', '/pay/?plan=agent_basic');
    await expect(page.locator('[data-checkout-off]')).toBeHidden();
  });

  test('a full cohort pays the regular plan', async ({ page }) => {
    await supabase(page, 'live', [{ cohort: 'agent_launch', used: 200, cap: 200 }]);
    await page.goto(`${BASE}/pricing/`, { waitUntil: 'networkidle' });
    await expect(page.locator('[data-card="agent_launch"] a.pr-go')).toHaveAttribute('href', '/pay/?plan=agent');
  });

  test('signed out, the payment page asks for sign-in and opens nothing', async ({ page }) => {
    await supabase(page, 'live');
    await page.goto(`${BASE}/pay/?plan=agent_launch`, { waitUntil: 'networkidle' });
    await expect(page.locator('#pay-signin')).toBeVisible();
    await expect(page.locator('iframe')).toHaveCount(0);
  });

  test('without a plan it says so', async ({ page }) => {
    await page.goto(`${BASE}/pay/`, { waitUntil: 'networkidle' });
    await expect(page.locator('#pay-noplan')).toBeVisible();
  });

  test('only Tranzila’s own window is ever framed', async ({ page }) => {
    await supabase(page, 'live');
    await signIn(page);
    await checkout(page, { url: 'https://direct.tranzila.com.evil.example/x' });
    await page.goto(`${BASE}/pay/?plan=agent_launch`, { waitUntil: 'networkidle' });
    await expect(page.locator('iframe')).toHaveCount(0);
    await expect(page.locator('[data-error="unavailable"]')).toBeVisible();
  });

  test('Tranzila’s window opens in the frame', async ({ page }) => {
    await supabase(page, 'live');
    await signIn(page);
    await page.route('https://direct.tranzila.com/**', (route) => route.fulfill({ status: 200, contentType: 'text/html', body: '<p>window</p>' }));
    await checkout(page, { url: 'https://direct.tranzila.com/amudsell/iframenew.php?sum=34.22' });
    await page.goto(`${BASE}/pay/?plan=agent_launch`, { waitUntil: 'networkidle' });
    await expect(page.locator('iframe')).toHaveAttribute('src', 'https://direct.tranzila.com/amudsell/iframenew.php?sum=34.22');
  });

  test('a refusal is said in words', async ({ page }) => {
    await supabase(page, 'live');
    await signIn(page);
    await checkout(page, { error: 'already_subscribed' });
    await page.goto(`${BASE}/pay/?plan=agent`, { waitUntil: 'networkidle' });
    await expect(page.locator('[data-error="already_subscribed"]')).toBeVisible();
  });

  test('the result page says paid, failed or still checking', async ({ page }) => {
    await page.goto(`${BASE}/pay/done/?r=paid&s=0f8fad5b-d9cb-469f-a165-70867728950e`);
    await expect(page.locator('#done-paid')).toBeVisible();
    await page.goto(`${BASE}/pay/done/?r=failed`);
    await expect(page.locator('#done-failed')).toBeVisible();
    await page.goto(`${BASE}/pay/done/?r=pending&s=0f8fad5b-d9cb-469f-a165-70867728950e`);
    await expect(page.locator('#done-pending')).toBeVisible();
  });
});
