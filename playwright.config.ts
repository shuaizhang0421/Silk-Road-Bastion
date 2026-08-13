import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 45_000,
  // WebGL edge anti-aliasing differs slightly across macOS GPU contexts and CI
  // software rendering. World-space geometry assertions catch structural regressions;
  // 3.5% keeps those hard failures while ignoring subpixel raster noise.
  expect: { timeout: 20_000, toHaveScreenshot: { maxDiffPixelRatio: 0.035 } },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: "http://127.0.0.1:5191",
    locale: "zh-CN",
    timezoneId: "Asia/Shanghai",
    reducedMotion: "reduce",
    screenshot: "only-on-failure",
    trace: "retain-on-failure"
  },
  webServer: {
    command: "pnpm exec vite --host 127.0.0.1 --port 5191 --strictPort",
    url: "http://127.0.0.1:5191",
    reuseExistingServer: true,
    timeout: 60_000
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } },
    { name: "ipad", use: { ...devices["iPad Pro 11"], browserName: "chromium" } },
    { name: "phone-portrait", use: { ...devices["iPhone 13"], browserName: "chromium", viewport: { width: 390, height: 844 } } },
    { name: "phone-landscape", use: { ...devices["Galaxy S9+"], viewport: { width: 800, height: 360 } } }
  ]
});
