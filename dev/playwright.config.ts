import {defineConfig, devices} from '@playwright/test'

try {
    process.loadEnvFile(new URL('.env', import.meta.url))
} catch {}

export default defineConfig({
    testDir: './test/e2e',
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 2 : 0,
    workers: 1,
    reporter: process.env.CI ? 'github' : 'list',
    use: {
        baseURL: process.env.SERVER_URL ?? 'http://localhost:3000',
        trace: 'retain-on-failure',
        locale: 'en-US',
    },
    projects: [{name: 'chromium', use: {...devices['Desktop Chrome']}}],
    webServer: {
        command: 'pnpm dev',
        url: 'http://localhost:3000/admin/login',
        reuseExistingServer: !process.env.CI,
        // revalidate on every request, so revoked sessions show up immediately
        env: {ZITADEL_SESSION_REVALIDATE: '0'},
        timeout: 120_000,
    },
})
