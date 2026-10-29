import type {AuthenticatedUser, AuthStrategy, Payload} from 'payload'
import {PLUGIN_SLUG} from './constants.ts'
import {fetchUserInfo, type Introspection, introspect} from './oidc/index.ts'
import {cookieNames, openSession, parseCookies, serializeCookie} from './session.ts'
import type {ZitadelAPIConfig, ZitadelResolvedOptions} from './types.ts'
import {findUser, syncUser, userDataFromClaims, type ZitadelUser} from './users.ts'

const INTROSPECTION_TTL = 60
const CACHE_SIZE = 1000

const introspections = new Map<string, {result: Introspection | null; expires: number}>()

const hash = async (token: string) =>
    Buffer.from(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))).toString('base64url')

/** active results are cached for a minute at most, never beyond the expiry of the token */
const cachedIntrospect = async (issuer: string, api: ZitadelAPIConfig, token: string) => {
    const key = await hash(token)
    const now = Date.now() / 1000
    const cached = introspections.get(key)
    if (cached && cached.expires > now) {
        return cached.result
    }
    const result = await introspect(issuer, api, token)
    if (introspections.size >= CACHE_SIZE) {
        introspections.delete(introspections.keys().next().value!)
    }
    introspections.set(key, {result, expires: Math.min(now + INTROSPECTION_TTL, result?.exp ?? Infinity)})
    return result
}

export const resetIntrospectionCache = () => introspections.clear()

const bearerToken = (headers: Headers) => {
    const [scheme, token] = headers.get('authorization')?.split(' ') ?? []
    return scheme?.toLowerCase() === 'bearer' && token ? token : null
}

const fromBearer = async (payload: Payload, options: ZitadelResolvedOptions, api: ZitadelAPIConfig, token: string) => {
    try {
        const result = await cachedIntrospect(options.issuer, api, token)
        return result?.sub ? await syncUser(payload, options, result.sub, userDataFromClaims(result, options)) : null
    } catch (error) {
        payload.logger.error({err: error, msg: `[${PLUGIN_SLUG}] token introspection failed`})
        return null
    }
}

const revalidations = new Map<string, {valid: Promise<boolean>; expires: number}>()

export const resetRevalidationCache = () => revalidations.clear()

/**
 * asks Zitadel at most once per interval and process whether the session is still alive, concurrent requests share
 * the pending check; when Zitadel can't be reached, the session stays valid until its own expiry
 */
const revalidate = async (
    payload: Payload,
    options: ZitadelResolvedOptions & {sessionRevalidate: number},
    accessToken: string,
    sub: string,
) => {
    const key = await hash(accessToken)
    const cached = revalidations.get(key)
    if (cached && cached.expires > Date.now()) {
        return cached.valid
    }
    const valid = fetchUserInfo(options, accessToken, sub).then(
        async claims => {
            if (claims) {
                await syncUser(payload, options, sub, userDataFromClaims(claims, options))
            }
            return !!claims
        },
        error => {
            payload.logger.warn({err: error, msg: `[${PLUGIN_SLUG}] session could not be revalidated`})
            revalidations.delete(key)
            return true
        },
    )
    if (revalidations.size >= CACHE_SIZE) {
        revalidations.delete(revalidations.keys().next().value!)
    }
    revalidations.set(key, {valid, expires: Date.now() + options.sessionRevalidate * 1000})
    return valid
}

const fromSession = async (
    payload: Payload,
    options: ZitadelResolvedOptions,
    headers: Headers,
): Promise<{user: ZitadelUser | null; revoked?: boolean}> => {
    const token = parseCookies(headers).get(cookieNames(payload.config.cookiePrefix).session)
    const session = token ? await openSession(payload.secret, options.collection, token) : null
    if (!session) {
        return {user: null}
    }
    if (options.sessionRevalidate !== false && session.accessToken) {
        const valid = await revalidate(
            payload,
            {...options, sessionRevalidate: options.sessionRevalidate},
            session.accessToken,
            session.sub,
        )
        if (!valid) {
            return {user: null, revoked: true}
        }
    }
    return {user: await findUser(payload, options, session.sub)}
}

export const zitadelStrategy = (options: ZitadelResolvedOptions): AuthStrategy => ({
    name: options.strategyName,
    authenticate: async ({headers, payload, canSetHeaders}) => {
        const token = options.api ? bearerToken(headers) : null
        const {user, revoked} =
            token && options.api
                ? {user: await fromBearer(payload, options, options.api, token)}
                : await fromSession(payload, options, headers)
        return {
            user: user
                ? ({...user, collection: options.collection, _strategy: options.strategyName} as AuthenticatedUser)
                : null,
            ...(revoked && canSetHeaders
                ? {
                      responseHeaders: new Headers({
                          'Set-Cookie': serializeCookie(cookieNames(payload.config.cookiePrefix).session, '', {
                              maxAge: 0,
                              secure: payload.config.serverURL.startsWith('https:'),
                          }),
                      }),
                  }
                : {}),
        }
    },
})
