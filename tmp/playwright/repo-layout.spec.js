
const { test, expect } = require('playwright/test');

test('repo layout', async ({ browser }) => {
  const context = await browser.newContext();
  await context.addCookies([{ name: 'i_like_gitea', value: '4a5980153b8ff13f', domain: 'localhost', path: '/', httpOnly: true, secure: false, sameSite: 'Lax' }]);
  const page = await context.newPage();
  page.on('console', msg => console.log('console:', msg.type(), msg.text()));
  await page.goto('http://localhost:3000/adihang/repo_test', { waitUntil: 'networkidle' });
  console.log('body classes:', await page.locator('body').getAttribute('class'));
  console.log('page-content classes:', await page.locator('div[role="main"][aria-label="adihang/repo_test"]').getAttribute('class'));
  const box = await page.locator('.repo-grid-filelist-sidebar').boundingBox();
  console.log('grid box:', JSON.stringify(box));
  const repoHeader = await page.locator('.repo-header').boundingBox();
  console.log('header box:', JSON.stringify(repoHeader));
  await page.screenshot({ path: '/tmp/hanplanet-repo-layout.png', fullPage: true });
});
