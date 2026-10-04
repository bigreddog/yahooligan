const { chromium } = require('playwright');

(async () => {
    const browser = await chromium.launch({ headless: true });

    // Test for standard desktop landscape
    const pageDesktop = await browser.newPage({
        viewport: { width: 1280, height: 720 }
    });
    await pageDesktop.goto('http://localhost:3000');
    // We need to wait for JS execution and DOM changes if any
    await pageDesktop.waitForTimeout(2000); // 2 second delay just in case

    // We need to make sure the overlay is closed so we can see the full HUD
    await pageDesktop.evaluate(() => {
        document.getElementById('route-chooser-overlay').style.display = 'none';
        document.getElementById('hud').style.display = 'block';
    });

    await pageDesktop.screenshot({ path: '/app/verification/screenshots/layout_fix_short_buttons.png', fullPage: true });

    await browser.close();
    console.log("Screenshot generated at /app/verification/screenshots/layout_fix_short_buttons.png");
})();
