import { test, expect } from "@playwright/test";

test("Phase 8 installs a safe service worker and provides a non-sensitive offline shell", async ({ page, context }) => {
  const errors=[];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("/app/");
  await expect(page.getByRole("heading", { name:"Sign in to your SkillWard workspace" })).toBeVisible();
  await page.evaluate(() => globalThis.SkillWardPWA.ready);
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);

  const pwa = await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.ready;
    const cacheNames = await caches.keys();
    const cachedUrls = (await Promise.all(cacheNames.map(async name => (await caches.open(name)).keys()))).flat().map(request => new URL(request.url).pathname);
    return { scope:registration.scope, release:globalThis.SkillWardPWA.release, cacheNames, cachedUrls };
  });
  expect(pwa.scope).toMatch(/\/$/);
  expect(pwa.release).toBe("20260825-phase8-mobile-pwa-1");
  expect(pwa.cacheNames).toEqual(["skillward-safe-shell-20260825-phase8-mobile-pwa-1"]);
  expect(pwa.cachedUrls).toContain("/offline.html");
  for (const forbidden of ["/app/", "/runtime-config.js", "/app.js", "/auth-bundle.js"]) expect(pwa.cachedUrls).not.toContain(forbidden);

  await context.setOffline(true);
  await page.goto("/app/?view=work", { waitUntil:"domcontentloaded" });
  await expect(page.getByRole("heading", { name:"Reconnect to SkillWard" })).toBeVisible();
  await expect(page.getByText(/does not store organisation, competency or evidence records/)).toBeVisible();
  await context.setOffline(false);
  await page.goto("/app/");
  await expect(page.getByRole("heading", { name:"Sign in to your SkillWard workspace" })).toBeVisible();
  expect(errors).toEqual([]);
});

test("Phase 8 remains contained with accessible controls at common mobile and tablet widths", async ({ page }) => {
  await page.goto("/app/");
  await expect(page.getByRole("heading", { name:"Sign in to your SkillWard workspace" })).toBeVisible();
  for (const viewport of [{width:360,height:800},{width:390,height:844},{width:430,height:932},{width:768,height:1024}]) {
    await page.setViewportSize(viewport);
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
    const primaryButtons = await page.locator("button.btn:visible").evaluateAll(buttons => buttons.map(button => button.getBoundingClientRect().height));
    expect(primaryButtons.length).toBeGreaterThan(0);
    expect(Math.min(...primaryButtons)).toBeGreaterThanOrEqual(44);
  }
});
