/**
 * runs against the local Zitadel from dev/zitadel (`pnpm --filter dev zitadel:up && pnpm --filter dev zitadel:setup`),
 * skipped when it is not provisioned
 */
import {existsSync, readFileSync} from 'node:fs'
import {afterAll, beforeEach, describe, expect, it} from 'vitest'
import {fetchUserInfo, introspect} from '../../src/oidc/index.ts'
import type {ZitadelAPIConfig, ZitadelKeyFile} from '../../src/types.ts'

const adminPat = new URL('../../dev/zitadel/.secrets/admin.pat', import.meta.url)

try {
    process.loadEnvFile(new URL('../../dev/.env', import.meta.url))
} catch {}

const env = process.env
const provisioned = !!(env.ZITADEL_TEST_MACHINE_ID && env.ZITADEL_TEST_API_KEY && existsSync(adminPat))

describe.skipIf(!provisioned)('against Zitadel', () => {
    const issuer = env.ZITADEL_ISSUER!
    const options = {issuer, clientId: env.ZITADEL_CLIENT_ID!}
    const machineId = env.ZITADEL_TEST_MACHINE_ID!

    // built lazily: the describe body also runs when the suite is skipped
    const apis = (): Record<string, ZitadelAPIConfig> => ({
        basic: {type: 'basic', clientId: env.ZITADEL_API_CLIENT_ID!, clientSecret: env.ZITADEL_API_CLIENT_SECRET!},
        jwt: {type: 'jwt', key: JSON.parse(env.ZITADEL_TEST_API_KEY!) as ZitadelKeyFile},
    })

    const management = async <T>(path: string, body: object = {}) => {
        const response = await fetch(issuer + path, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${readFileSync(adminPat, 'utf8').trim()}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(body),
        })
        if (!response.ok) {
            throw new Error(`${path} failed: ${response.status} ${await response.text()}`)
        }
        return (await response.json()) as T
    }

    /** a fresh personal access token of the machine user, standing in for the bearer token of an API client */
    let token: string

    beforeEach(async () => {
        ;({token} = await management<{token: string}>(`/management/v1/users/${machineId}/pats`, {
            expirationDate: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        }))
    })

    afterAll(async () => {
        await management(`/v2/users/${machineId}/reactivate`).catch(() => {})
    })

    it.each(['basic', 'jwt'])('introspects tokens with %s client authentication', async type => {
        expect(await introspect(issuer, apis()[type]!, token)).toMatchObject({active: true, sub: machineId})
    })

    it('reports unknown tokens as inactive', async () => {
        expect(await introspect(issuer, apis().basic!, 'not-a-token')).toBeNull()
    })

    it('detects deactivated users via userinfo and introspection', async () => {
        expect(await fetchUserInfo(options, token, machineId)).toMatchObject({sub: machineId})

        await management(`/v2/users/${machineId}/deactivate`)
        expect(await fetchUserInfo(options, token, machineId)).toBeNull()
        expect(await introspect(issuer, apis().basic!, token)).toBeNull()

        // Zitadel keeps tokens issued before the deactivation revoked, even after reactivating the user
        await management(`/v2/users/${machineId}/reactivate`)
        expect(await fetchUserInfo(options, token, machineId)).toBeNull()
    })
})
