import {readFileSync} from 'node:fs'
import {expect, type Page, test} from '@playwright/test'

test('login view offers sign in with Zitadel instead of the local form', async ({page}) => {
    await page.goto('/admin/login')
    const button = page.getByRole('link', {name: 'Sign in with Zitadel'})
    await expect(button).toBeVisible()
    await expect(button).toHaveAttribute('href', /\/api\/users\/zitadel\/authorize$/)
    await expect(page.locator('input[type="password"]')).toHaveCount(0)
})

test('protected admin views redirect to the login view', async ({page}) => {
    await page.goto('/admin')
    await expect(page).toHaveURL(/\/admin\/login/)
})

test('a forged callback without transaction is rejected', async ({page}) => {
    await page.goto('/api/users/zitadel/callback?code=forged&state=forged')
    await expect(page).toHaveURL(/\/admin\/login\?zitadel-error=transaction/)
})

test.describe('with a provisioned Zitadel', () => {
    test.skip(!process.env.ZITADEL_TEST_USERNAME, 'run `pnpm zitadel:up && pnpm zitadel:setup` first')

    /** the Zitadel login UI hydrates late, inputs filled before that get reset */
    const enterCredentials = async (page: Page) => {
        await page.waitForURL(/localhost:3001/)
        await page.waitForLoadState('networkidle')
        await page.getByLabel('Loginname').fill(process.env.ZITADEL_TEST_USERNAME ?? '')
        await page.getByRole('button', {name: 'Continue'}).click()
        await page.waitForLoadState('networkidle')
        await page.getByLabel('Password').fill(process.env.ZITADEL_TEST_PASSWORD ?? '')
        await page.getByRole('button', {name: 'Continue'}).click()
    }

    const signIn = async (page: Page) => {
        await page.goto('/admin/login')
        await page.getByRole('link', {name: 'Sign in with Zitadel'}).click()
        await enterCredentials(page)
        await expect(page).toHaveURL(/localhost:3000\/admin$/)
    }

    test('signs in through Zitadel and syncs the user', async ({page}) => {
        await signIn(page)
        const me = await page.evaluate(() => fetch('/api/users/me').then(response => response.json()))
        expect(me.user).toMatchObject({
            _strategy: 'zitadel',
            email: 'test@example.com',
            name: 'Test User',
            roles: ['admin'],
        })
        expect(me.user.zitadelId).toEqual(expect.any(String))
    })

    test('keeps the requested redirect', async ({page}) => {
        await page.goto('/admin/collections/users')
        await expect(page).toHaveURL(/\/admin\/login/)
        await page.getByRole('link', {name: 'Sign in with Zitadel'}).click()
        await enterCredentials(page)
        await expect(page).toHaveURL(/\/admin\/collections\/users/)
    })

    test('signs out of Payload and Zitadel', async ({page}) => {
        await signIn(page)
        await page.goto('/api/users/zitadel/logout')
        await expect(page).toHaveURL(/localhost:3000\/admin\/login$/)
        const me = await page.evaluate(() => fetch('/api/users/me').then(response => response.json()))
        expect(me.user).toBeNull()
        // the login UI still lists the account, but the Zitadel session is gone and the password is required again
        await page.getByRole('link', {name: 'Sign in with Zitadel'}).click()
        await page.waitForURL(/localhost:3001\/ui\/v2\/login\/accounts/)
        await page.waitForLoadState('networkidle')
        await page.getByRole('button', {name: process.env.ZITADEL_TEST_USERNAME}).click()
        await expect(page.getByLabel('Password')).toBeVisible()
    })

    test('the built-in logout route of Payload ends the Zitadel session as well', async ({page}) => {
        await signIn(page)
        await page.goto('/admin/logout')
        await expect(page).toHaveURL(/localhost:3000\/admin\/login$/)
        await page.getByRole('link', {name: 'Sign in with Zitadel'}).click()
        await page.waitForURL(/localhost:3001\/ui\/v2\/login\/accounts/)
    })

    test('a copied session cookie stops working once the Zitadel session ended', async ({page, context}) => {
        await signIn(page)
        const session = (await context.cookies()).find(({name}) => name === 'payload-zitadel-session')!
        await page.goto('/api/users/zitadel/logout')
        await expect(page).toHaveURL(/\/admin\/login$/)

        await context.addCookies([session])
        const me = await page.evaluate(() => fetch('/api/users/me').then(response => response.json()))
        expect(me.user).toBeNull()
    })

    test('API clients authenticate with bearer tokens', async ({request}) => {
        const adminPat = readFileSync(new URL('../../zitadel/.secrets/admin.pat', import.meta.url), 'utf8').trim()
        const machineId = process.env.ZITADEL_TEST_MACHINE_ID!
        const issued = await fetch(`${process.env.ZITADEL_ISSUER}/management/v1/users/${machineId}/pats`, {
            method: 'POST',
            headers: {Authorization: `Bearer ${adminPat}`, 'Content-Type': 'application/json'},
            body: JSON.stringify({expirationDate: new Date(Date.now() + 60 * 60 * 1000).toISOString()}),
        }).then(response => response.json())

        const me = await (
            await request.get('/api/users/me', {headers: {Authorization: `Bearer ${issued.token}`}})
        ).json()
        expect(me.user).toMatchObject({zitadelId: machineId, name: 'API Client', _strategy: 'zitadel'})

        const anonymous = await (await request.get('/api/users/me', {headers: {Authorization: 'Bearer forged'}})).json()
        expect(anonymous.user).toBeNull()
    })
})
