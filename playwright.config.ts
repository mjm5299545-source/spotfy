import {existsSync} from 'node:fs';
import {defineConfig} from '@playwright/test';
const e2eDatabasePath = process.env.SPOTFY_E2E_DB_PATH || `/tmp/spotfy-e2e-${process.pid}/music.sqlite`;
process.env.SPOTFY_E2E_DB_PATH = e2eDatabasePath;
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 45_000,
  expect: {timeout: 10_000},
  reporter: [['list'], ['html', {open:'never'}], ['json', {outputFile:'test-results/results.json'}]],
  use: {
    baseURL: 'http://127.0.0.1:5173',
    viewport: {width:1440,height:900},
    launchOptions: {executablePath:process.env.CHROMIUM_PATH || (existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),args:['--no-sandbox','--autoplay-policy=no-user-gesture-required']},
    trace:'retain-on-failure',
    screenshot:'only-on-failure',
  },
  webServer: {
    command:'npm run dev',
    url:'http://127.0.0.1:5173',
    timeout:30_000,
    reuseExistingServer:!process.env.CI,
    env: {DATABASE_PATH:e2eDatabasePath,DATA_DIR:`/tmp/spotfy-e2e-${process.pid}`,COOKIE_SECURE:'false'},
  },
});
