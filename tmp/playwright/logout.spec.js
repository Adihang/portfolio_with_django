const { test, expect } = require('playwright/test');

test('bumpercar start-card logout works', async ({ page }) => {
  page.on('console', (msg) => console.log('console:', msg.type(), msg.text()));
  page.on('pageerror', (err) => console.log('pageerror:', err.message));

  await page.goto('http://127.0.0.1/ko/ide/login/?next=/ko/fun/bumpercar-spiky/');
  await page.fill('input[name="username"]', 'codexlogout');
  await page.fill('input[name="password"]', 'codexpass123!');
  await page.click('button[type="submit"]');
  await page.waitForURL('**/ko/fun/bumpercar-spiky/**');

  await page.click('[data-auth-account-trigger]');
  await expect(page.locator('[data-auth-account-menu]')).toBeVisible();

  await page.click('[data-auth-account-logout]');
  await expect(page.locator('#root-auth-logout-modal')).toBeVisible();

  await page.click('#root-auth-logout-confirm-btn');
  await page.waitForTimeout(1500);

  console.log('final url:', page.url());
  console.log('trigger count:', await page.locator('[data-auth-account-trigger]').count());
  console.log('login count:', await page.locator('a[href*="/ide/login"]').count());

  await page.screenshot({ path: 'tmp/playwright/logout-result.png', fullPage: true });
});
