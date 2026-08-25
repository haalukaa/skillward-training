import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: ["phase1-local.spec.mjs", "phase6-reporting.spec.mjs", "phase7-security-operations.spec.mjs", "phase8-pwa.spec.mjs", "phase9-launch.spec.mjs"],
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 75_000,
  expect: { timeout: 15_000 },
  reporter: [["line"]],
  use: {
    baseURL: process.env.SKILLWARD_BASE_URL || "http://127.0.0.1:4173",
    screenshot: "only-on-failure",
    trace: "off",
    video: "off"
  },
  projects: [
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"], ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? { launchOptions:{ executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } } : {}), viewport: { width: 1440, height: 900 } }
    },
    {
      name: "mobile",
      use: {
        browserName: "chromium",
        ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? { launchOptions:{ executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } } : {}),
        viewport: { width: 390, height: 844 },
        screen: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
        deviceScaleFactor: 1
      }
    }
  ]
});
