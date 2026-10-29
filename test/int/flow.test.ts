import {sqliteAdapter} from '@payloadcms/db-sqlite'
import {OAuth2Server} from 'oauth2-mock-server'
import {buildConfig, createPayloadRequestFromWebRequest, getPayload, type Payload, type PayloadHandler} from 'payload'
import {afterAll, beforeAll, beforeEach, describe, expect, it} from 'vitest'
import {zitadelPlugin} from '../../src/index.ts'
import {resetIntrospectionCache, resetRevalidationCache} from '../../src/strategy.ts'

const SERVER = 'http://localhost:3000'
const CLIENT_ID = 'payload-client'
const ROLES = 'urn:zitadel:iam:org:project:roles'

let idp: OAuth2Server
let payload: Payload
let claims: Record<string, unknown>
let userinfoStatus: number

beforeAll(async () => {
    idp = new OAuth2Server()
    await idp.issuer.keys.generate('RS256')
    await idp.start(0, 'localhost')
    idp.service.on('beforeTokenSigning', token => {
        Object.assign(token.payload, {aud: CLIENT_ID}, claims)
    })
    idp.service.on('beforeUserinfo', userinfo => {
        userinfo.statusCode = userinfoStatus
        userinfo.body = userinfoStatus === 200 ? claims : {error: 'invalid_token'}
    })

    payload = await getPayload({
        config: buildConfig({
            admin: {user: 'users'},
            collections: [{slug: 'users', auth: true, fields: []}],
            db: sqliteAdapter({client: {url: ':memory:'}, push: true}),
            secret: 'test-secret',
            serverURL: SERVER,
            plugins: [
                zitadelPlugin({
                    issuer: idp.issuer.url!,
                    clientId: CLIENT_ID,
                    api: {type: 'basic', clientId: 'api', clientSecret: 'secret'},
                }),
            ],
        }),
        cron: false,
    })
})

afterAll(async () => {
    await payload?.destroy()
    await idp?.stop()
})

beforeEach(() => {
    claims = {sub: 'zitadel-1', name: 'Ada Lovelace', email: 'ada@example.com', [ROLES]: {admin: {}, editor: {}}}
    userinfoStatus = 200
    resetIntrospectionCache()
    resetRevalidationCache()
})

const handler = (path: string): PayloadHandler =>
    (payload.collections.users!.config.endpoints || []).find(endpoint => endpoint.path === path)!.handler

const call = async (path: string, url: string, cookies: string[] = []) =>
    handler(path)(
        await createPayloadRequestFromWebRequest({
            config: payload.config,
            request: new Request(url, {headers: {cookie: cookies.join('; ')}}),
        }),
    )

/** turns Set-Cookie headers into the Cookie header a browser would send */
const cookiesOf = (response: Response) =>
    response.headers
        .getSetCookie()
        .map(cookie => cookie.split(';')[0]!)
        .filter(cookie => !cookie.endsWith('='))

const signIn = async (redirect?: string) => {
    const query = redirect ? `?${new URLSearchParams({redirect})}` : ''
    const authorize = await call('/zitadel/authorize', `${SERVER}/api/users/zitadel/authorize${query}`)
    const transaction = cookiesOf(authorize)
    const idpResponse = await fetch(authorize.headers.get('location')!, {redirect: 'manual'})
    const callbackURL = idpResponse.headers.get('location')!
    return {transaction, callbackURL, response: await call('/zitadel/callback', callbackURL, transaction)}
}

describe('authorization code flow', () => {
    it('starts with PKCE, state and nonce', async () => {
        const response = await call('/zitadel/authorize', `${SERVER}/api/users/zitadel/authorize`)
        expect(response.status).toBe(302)
        const url = new URL(response.headers.get('location')!)
        expect(url.origin).toBe(new URL(idp.issuer.url!).origin)
        expect(Object.fromEntries(url.searchParams)).toMatchObject({
            client_id: CLIENT_ID,
            redirect_uri: `${SERVER}/api/users/zitadel/callback`,
            response_type: 'code',
            code_challenge_method: 'S256',
        })
        expect(url.searchParams.get('state')).toBeTruthy()
        expect(url.searchParams.get('nonce')).toBeTruthy()
        expect(response.headers.getSetCookie()[0]).toMatch(/^payload-zitadel-tx=.+HttpOnly; SameSite=Lax/)
    })

    it('signs in, syncs the user and authenticates with the session cookie', async () => {
        const {response} = await signIn()
        expect(response.status).toBe(302)
        expect(response.headers.get('location')).toBe(`${SERVER}/admin`)

        const session = cookiesOf(response)
        expect(session).toEqual([expect.stringMatching(/^payload-zitadel-session=/)])

        const {user} = await payload.auth({headers: new Headers({cookie: session.join('; ')})})
        expect(user).toMatchObject({
            zitadelId: 'zitadel-1',
            name: 'Ada Lovelace',
            email: 'ada@example.com',
            roles: ['admin', 'editor'],
            collection: 'users',
            _strategy: 'zitadel',
        })
    })

    it('updates the user only when Zitadel data changed', async () => {
        await signIn()
        const before = await payload.find({
            collection: 'users',
            where: {zitadelId: {equals: 'zitadel-1'}},
            overrideAccess: true,
        })
        await signIn()
        const unchanged = await payload.findByID({collection: 'users', id: before.docs[0]!.id, overrideAccess: true})
        expect(unchanged.updatedAt).toBe(before.docs[0]!.updatedAt)

        claims = {...claims, [ROLES]: {editor: {}}}
        await signIn()
        const changed = await payload.findByID({collection: 'users', id: before.docs[0]!.id, overrideAccess: true})
        expect(changed.roles).toEqual(['editor'])
    })

    it('redirects to the requested path, but never to another origin', async () => {
        expect((await signIn('/admin/collections/users')).response.headers.get('location')).toBe(
            `${SERVER}/admin/collections/users`,
        )
        expect((await signIn('//evil.example.com')).response.headers.get('location')).toBe(`${SERVER}/admin`)
        expect((await signIn('https://evil.example.com')).response.headers.get('location')).toBe(`${SERVER}/admin`)
    })

    it('rejects a callback without transaction cookie', async () => {
        const {callbackURL} = await signIn()
        const response = await call('/zitadel/callback', callbackURL)
        expect(response.headers.get('location')).toBe(`${SERVER}/admin/login?zitadel-error=transaction`)
        expect(cookiesOf(response)).toEqual([])
    })

    it('rejects a callback with a foreign state', async () => {
        const {transaction} = await signIn()
        const response = await call(
            '/zitadel/callback',
            `${SERVER}/api/users/zitadel/callback?code=stolen&state=foreign`,
            transaction,
        )
        expect(response.headers.get('location')).toBe(`${SERVER}/admin/login?zitadel-error=authorization`)
    })

    it('rejects an ID token with a foreign nonce', async () => {
        claims = {...claims, nonce: 'foreign'}
        const {response} = await signIn()
        expect(response.headers.get('location')).toBe(`${SERVER}/admin/login?zitadel-error=authorization`)
    })

    it('ignores tampered session cookies', async () => {
        const [session] = cookiesOf((await signIn()).response)
        const tampered = `${session!.slice(0, -4)}AAAA`
        expect((await payload.auth({headers: new Headers({cookie: tampered})})).user).toBeNull()
    })
})

describe('session revalidation', () => {
    it('picks up changes made in Zitadel', async () => {
        const session = cookiesOf((await signIn()).response).join('; ')
        claims = {...claims, name: 'Ada King', [ROLES]: {editor: {}}}
        const {user} = await payload.auth({headers: new Headers({cookie: session})})
        expect(user).toMatchObject({name: 'Ada King', roles: ['editor']})
    })

    it('ends the session when Zitadel no longer accepts it', async () => {
        const session = cookiesOf((await signIn()).response).join('; ')
        userinfoStatus = 401
        const {user, responseHeaders} = await payload.auth({
            headers: new Headers({cookie: session}),
            canSetHeaders: true,
        })
        expect(user).toBeNull()
        expect(responseHeaders?.get('set-cookie')).toMatch(/^payload-zitadel-session=; .*Max-Age=0/)
    })

    it('keeps the session when Zitadel is not reachable', async () => {
        const session = cookiesOf((await signIn()).response).join('; ')
        userinfoStatus = 500
        expect((await payload.auth({headers: new Headers({cookie: session})})).user).toMatchObject({
            zitadelId: 'zitadel-1',
        })
    })
})

describe('logout', () => {
    it('clears the session and ends the Zitadel session with an ID token hint', async () => {
        const session = cookiesOf((await signIn()).response)
        const response = await call('/zitadel/logout', `${SERVER}/api/users/zitadel/logout`, session)
        const url = new URL(response.headers.get('location')!)
        expect(url.pathname).toBe('/endsession')
        expect(url.searchParams.get('id_token_hint')).toBeTruthy()
        expect(url.searchParams.get('post_logout_redirect_uri')).toBe(`${SERVER}/api/users/zitadel/callback`)
        expect(response.headers.getSetCookie()).toContainEqual(
            expect.stringMatching(/^payload-zitadel-session=; .*Max-Age=0/),
        )

        const back = await call(
            '/zitadel/callback',
            `${SERVER}/api/users/zitadel/callback?state=${url.searchParams.get('state')}`,
            cookiesOf(response),
        )
        expect(back.headers.get('location')).toBe(`${SERVER}/admin/login`)
    })
})

describe('bearer tokens', () => {
    it('are no longer decoded as Payload JWTs', () => {
        expect(payload.config.auth.jwtOrder).not.toContain('Bearer')
    })

    it('authenticates API clients via introspection', async () => {
        idp.service.once('beforeIntrospect', introspection => {
            introspection.body = {active: true, sub: 'zitadel-2', name: 'Grace Hopper', [ROLES]: {editor: {}}}
        })
        const {user} = await payload.auth({headers: new Headers({authorization: 'Bearer valid-token'})})
        expect(user).toMatchObject({zitadelId: 'zitadel-2', name: 'Grace Hopper', roles: ['editor']})
    })

    it('rejects inactive tokens', async () => {
        idp.service.once('beforeIntrospect', introspection => {
            introspection.body = {active: false}
        })
        expect((await payload.auth({headers: new Headers({authorization: 'Bearer revoked'})})).user).toBeNull()
    })
})
