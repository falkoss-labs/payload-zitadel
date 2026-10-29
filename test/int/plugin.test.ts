import {sqliteAdapter} from '@payloadcms/db-sqlite'
import {buildConfig, getPayload, type Payload} from 'payload'
import {afterAll, beforeAll, describe, expect, it} from 'vitest'
import {zitadelPlugin} from '../../src/index.ts'

let payload: Payload

beforeAll(async () => {
    payload = await getPayload({
        config: buildConfig({
            admin: {user: 'users'},
            collections: [{slug: 'users', auth: true, fields: []}],
            db: sqliteAdapter({client: {url: ':memory:'}, push: true}),
            secret: 'test-secret',
            plugins: [zitadelPlugin({issuer: 'https://idp.example.com', clientId: 'client'})],
        }),
        cron: false,
    })
})

afterAll(async () => {
    await payload?.destroy()
})

describe('zitadelPlugin', () => {
    it('replaces the local strategy of the auth collection', () => {
        const {auth} = payload.collections.users!.config
        expect(auth.disableLocalStrategy).toBe(true)
        expect(auth.strategies.map(({name}) => name)).toContain('zitadel')
    })

    it('mounts the endpoints on the auth collection', () => {
        const paths = (payload.collections.users!.config.endpoints || []).map(({path}) => path)
        expect(paths).toEqual(expect.arrayContaining(['/zitadel/authorize', '/zitadel/callback', '/zitadel/logout']))
    })

    it('registers the admin components', () => {
        const {admin} = payload.config
        expect(admin.components.afterLogin).toContainEqual(
            expect.objectContaining({path: '@falkoss/payload-zitadel/client#LoginButton'}),
        )
        expect(admin.components.logout?.Button).toMatchObject({
            path: '@falkoss/payload-zitadel/client#LogoutButton',
        })
    })

    it('replaces the built-in logout views', () => {
        const {views} = payload.config.admin.components
        expect(views?.logout?.Component).toMatchObject({path: '@falkoss/payload-zitadel/client#LogoutRedirect'})
        expect(views?.inactivity?.Component).toMatchObject({
            path: '@falkoss/payload-zitadel/client#LogoutRedirect',
        })
    })

    it('leaves bearer tokens to Payload without introspection', () => {
        expect(payload.config.auth.jwtOrder).toContain('Bearer')
    })

    it('stores users with their Zitadel ID', async () => {
        const user = await payload.create({
            collection: 'users',
            data: {zitadelId: '123', email: 'test@example.com', roles: ['admin']},
            overrideAccess: true,
        })
        expect(user).toMatchObject({zitadelId: '123', roles: ['admin']})
    })
})
