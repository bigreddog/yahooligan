const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    recordVideo: { dir: 'verification/videos' }
  });
  const page = await context.newPage();

  // Navigate to local server
  await page.goto('http://localhost:8000');

  // Wait for route chooser and load a route
  await page.waitForSelector('#btn-confirm-route');
  await page.click('#btn-confirm-route');

  // Wait for HUD to appear
  await page.waitForSelector('#hud');

  // Take screenshot
  await page.waitForTimeout(2000);
  await page.screenshot({ path: 'verification/screenshots/layout_fix.png' });
  console.log('Screenshot saved to verification/screenshots/layout_fix.png');

  await browser.close();
})();
