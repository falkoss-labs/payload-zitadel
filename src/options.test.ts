import {describe, expect, it} from 'vitest'
import {resolveOptions} from './options.ts'

const config = {admin: {user: 'users'}, collections: [{slug: 'users', auth: true, fields: []}]}

describe('resolveOptions', () => {
    it('falls back to environment variables', () => {
        const {resolved, issues} = resolveOptions({}, config, {
            ZITADEL_ISSUER: 'https://idp.example.com/',
            ZITADEL_CLIENT_ID: 'client',
        })
        expect(issues).toEqual([])
        expect(resolved.issuer).toBe('https://idp.example.com')
        expect(resolved.clientId).toBe('client')
        expect(resolved.collection).toBe('users')
        expect(resolved.api).toBe(false)
    })

    it('prefers explicit options over the environment', () => {
        const {resolved} = resolveOptions({issuer: 'https://a.example.com', clientId: 'a'}, config, {
            ZITADEL_ISSUER: 'https://b.example.com',
            ZITADEL_CLIENT_ID: 'b',
        })
        expect(resolved.issuer).toBe('https://a.example.com')
        expect(resolved.clientId).toBe('a')
    })

    it('reports missing and invalid settings', () => {
        const {issues} = resolveOptions({issuer: 'not a url', collection: 'posts'}, config, {})
        expect(issues).toHaveLength(3)
    })

    it('reads API credentials from the environment', () => {
        const key = {keyId: 'k', key: 'pem', appId: 'a', clientId: 'c'}
        expect(resolveOptions({}, config, {ZITADEL_API_KEY: JSON.stringify(key)}).resolved.api).toEqual({
            type: 'jwt',
            key,
        })
        expect(
            resolveOptions({}, config, {ZITADEL_API_CLIENT_ID: 'id', ZITADEL_API_CLIENT_SECRET: 'secret'}).resolved.api,
        ).toEqual({type: 'basic', clientId: 'id', clientSecret: 'secret'})
        expect(resolveOptions({}, config, {ZITADEL_API_CLIENT_ID: 'id'}).issues).toContain(
            'ZITADEL_API_CLIENT_ID is set, but ZITADEL_API_CLIENT_SECRET is missing',
        )
    })

    it('merges field overrides with the defaults', () => {
        const {resolved} = resolveOptions({fields: {image: {name: 'avatar', hidden: true}}}, config, {})
        expect(resolved.fields.image).toEqual({name: 'avatar', hidden: true})
        expect(resolved.fields.zitadelId.name).toBe('zitadelId')
    })
})
