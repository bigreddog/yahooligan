const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
    args: ["--no-sandbox", "--enable-unsafe-swiftshader"],
  });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(() => {
    window.bluetoothRequests = 0;
    Object.defineProperty(navigator, "bluetooth", {
      value: {
        requestDevice: async () => {
          window.bluetoothRequests++;
          throw new Error("Tour must not connect");
        },
      },
    });
  });
  try {
    await fs.mkdir("verification/results", { recursive: true });
    await page.goto("http://127.0.0.1:8000");
    await page.waitForFunction(() => document.querySelector("#tour").open);
    assert.equal(
      await page.locator("#tour-title").textContent(),
      "Choose your ride",
    );
    await page.screenshot({ path: "verification/results/tour-mobile.png" });
    await page.click("#tour-skip");
    assert.equal(
      await page.evaluate(() => document.activeElement.id),
      "btn-tour",
    );
    await page.reload();
    await page.waitForTimeout(700);
    assert.equal(
      await page.evaluate(() => document.querySelector("#tour").open),
      false,
    );
    await page.selectOption("#profile", "intervals");
    await page.fill("#minutes", "20");
    await page.click("#btn-tour");
    for (let i = 0; i < 11; i++) {
      assert.match(
        await page.locator("#tour-count").textContent(),
        new RegExp(`^${i + 1} of 11`),
      );
      const geometry = await page.evaluate(() => {
        const card = document
          .querySelector("#tour-card")
          .getBoundingClientRect();
        const spot = document
          .querySelector("#tour-spotlight")
          .getBoundingClientRect();
        return {
          inside:
            card.left >= 0 &&
            card.top >= 0 &&
            card.right <= innerWidth &&
            card.bottom <= innerHeight,
          spotVisible: spot.width > 0 && spot.height > 0,
          overflow: document.documentElement.scrollWidth > innerWidth,
        };
      });
      assert.equal(geometry.inside, true);
      assert.equal(geometry.spotVisible, true);
      assert.equal(geometry.overflow, false);
      if (i === 6) {
        assert.equal(
          await page.locator("#ride-status").textContent(),
          "TOUR PREVIEW",
        );
        await page.screenshot({
          path: "verification/results/tour-ride-mobile.png",
        });
        await page.click("#tour-back");
        assert.match(
          await page.locator("#tour-count").textContent(),
          /^6 of 11/,
        );
        assert.equal(await page.locator("#setup-panel").isVisible(), true);
        await page.click("#tour-next");
      }
      if (i === 9) {
        assert.equal(await page.locator("#ride-tools").isVisible(), true);
        await page.setViewportSize({ width: 844, height: 390 });
        await page.screenshot({
          path: "verification/results/tour-landscape.png",
        });
      }
      await page.click("#tour-next");
    }
    assert.equal(
      await page.evaluate(() => document.querySelector("#tour").open),
      false,
    );
    assert.equal(await page.locator("#setup-panel").isVisible(), true);
    assert.equal(await page.locator("#profile").inputValue(), "intervals");
    assert.equal(await page.locator("#minutes").inputValue(), "20");
    assert.equal(await page.evaluate(() => bluetoothRequests), 0);
    await page.click("#btn-tour");
    await page.keyboard.press("ArrowRight");
    assert.match(await page.locator("#tour-count").textContent(), /^2 of 11/);
    await page.keyboard.press("Escape");
    assert.equal(
      await page.evaluate(() => document.querySelector("#tour").open),
      false,
    );
    const second = await context.newPage();
    await second.goto("http://127.0.0.1:8000");
    await second.waitForTimeout(700);
    assert.equal(
      await second.evaluate(() => document.querySelector("#tour").open),
      false,
    );
    await second.close();
    // A blocked storage API must not create a repeating automatic tour.
    const privatePage = await browser.newPage();
    await privatePage.addInitScript(() => {
      Storage.prototype.getItem = () => {
        throw new Error("Blocked");
      };
      Storage.prototype.setItem = () => {
        throw new Error("Blocked");
      };
    });
    await privatePage.goto("http://127.0.0.1:8000");
    await privatePage.waitForTimeout(700);
    assert.equal(
      await privatePage.evaluate(() => document.querySelector("#tour").open),
      false,
    );
    await privatePage.click("#btn-tour");
    assert.equal(
      await privatePage.evaluate(() => document.querySelector("#tour").open),
      true,
    );
    await privatePage.close();
    assert.deepEqual(errors, []);
    console.log(
      "Tour checks passed: first visit, dismissal, reload/new tab persistence, all steps, ride preview, Back/Escape, mobile/landscape, settings preservation, no Bluetooth requests and blocked storage.",
    );
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
