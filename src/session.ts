import {EncryptJWT, jwtDecrypt} from 'jose'
import {COOKIES, DEFAULTS} from './constants.ts'

export type CookieOptions = {
    maxAge: number
    secure: boolean
}

export const parseCookies = (headers: Headers): Map<string, string> =>
    new Map(
        (headers.get('cookie') ?? '')
            .split(';')
            .map(pair => pair.trim())
            .filter(Boolean)
            .map(pair => {
                const index = pair.indexOf('=')
                return index < 0 ? [pair, ''] : [pair.slice(0, index), decodeURIComponent(pair.slice(index + 1))]
            }),
    )

export const serializeCookie = (name: string, value: string, {maxAge, secure}: CookieOptions) =>
    [
        `${name}=${encodeURIComponent(value)}`,
        'Path=/',
        'HttpOnly',
        'SameSite=Lax',
        `Max-Age=${maxAge}`,
        ...(maxAge <= 0 ? ['Expires=Thu, 01 Jan 1970 00:00:00 GMT'] : []),
        ...(secure ? ['Secure'] : []),
    ].join('; ')

export const cookieNames = (prefix: string) => ({
    session: `${prefix}-${COOKIES.session}`,
    transaction: `${prefix}-${COOKIES.transaction}`,
})

const keys = new Map<string, Promise<{session: Uint8Array; transaction: Uint8Array}>>()

const deriveKey = async (secret: string, info: string) => {
    const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), 'HKDF', false, [
        'deriveBits',
    ])
    return new Uint8Array(
        await crypto.subtle.deriveBits(
            {name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(), info: new TextEncoder().encode(info)},
            material,
            256,
        ),
    )
}

/** separate keys derived from the Payload secret, so cookies of this plugin can never be confused with Payload tokens */
const getKeys = (secret: string) => {
    let derived = keys.get(secret)
    if (!derived) {
        derived = Promise.all([
            deriveKey(secret, 'payload-zitadel session'),
            deriveKey(secret, 'payload-zitadel transaction'),
        ]).then(([session, transaction]) => ({session, transaction}))
        keys.set(secret, derived)
    }
    return derived
}

const SESSION_TYPE = 'zitadel-session+jwt'

export type Session = {
    /** subject of the ID token, i.e. the Zitadel user ID */
    sub: string
    /** Zitadel session ID, if provided by the ID token */
    sid?: string
    /** the raw ID token, sent as `id_token_hint` on logout */
    idToken?: string
    /** access token, used to revalidate the session against Zitadel */
    accessToken?: string
}

/** encrypted, as the session carries the ID token */
export const sealSession = async (
    secret: string,
    audience: string,
    {sub, sid, idToken, accessToken}: Session,
    maxAge: number,
) =>
    new EncryptJWT({
        ...(sid ? {sid} : {}),
        ...(idToken ? {idt: idToken} : {}),
        ...(accessToken ? {at: accessToken} : {}),
    })
        .setProtectedHeader({alg: 'dir', enc: 'A256GCM', typ: SESSION_TYPE})
        .setSubject(sub)
        .setAudience(audience)
        .setIssuedAt()
        .setExpirationTime(`${maxAge}s`)
        .encrypt((await getKeys(secret)).session)

export const openSession = async (secret: string, audience: string, token: string): Promise<Session | null> => {
    try {
        const {payload, protectedHeader} = await jwtDecrypt(token, (await getKeys(secret)).session, {
            keyManagementAlgorithms: ['dir'],
            contentEncryptionAlgorithms: ['A256GCM'],
            audience,
            requiredClaims: ['sub', 'exp'],
        })
        if (protectedHeader.typ !== SESSION_TYPE) {
            return null
        }
        return {
            sub: payload.sub!,
            ...(typeof payload.sid === 'string' ? {sid: payload.sid} : {}),
            ...(typeof payload.idt === 'string' ? {idToken: payload.idt} : {}),
            ...(typeof payload.at === 'string' ? {accessToken: payload.at} : {}),
        }
    } catch {
        return null
    }
}

export type Transaction =
    | {kind: 'login'; state: string; nonce: string; codeVerifier: string; redirect?: string}
    | {kind: 'logout'; state: string; redirect?: string}

/** encrypted, as the transaction carries the PKCE code verifier */
export const sealTransaction = async (secret: string, transaction: Transaction) =>
    new EncryptJWT({transaction})
        .setProtectedHeader({alg: 'dir', enc: 'A256GCM'})
        .setIssuedAt()
        .setExpirationTime(`${DEFAULTS.transactionMaxAge}s`)
        .encrypt((await getKeys(secret)).transaction)

export const openTransaction = async (secret: string, token: string): Promise<Transaction | null> => {
    try {
        const {payload} = await jwtDecrypt<{transaction: Transaction}>(token, (await getKeys(secret)).transaction, {
            keyManagementAlgorithms: ['dir'],
            contentEncryptionAlgorithms: ['A256GCM'],
        })
        return payload.transaction ?? null
    } catch {
        return null
    }
}
