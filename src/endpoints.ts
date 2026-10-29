import type {Endpoint, PayloadHandler, PayloadRequest} from 'payload'
import {DEFAULTS, ENDPOINTS, PLUGIN_SLUG} from './constants.ts'
import {completeAuthorizationRequest, createAuthorizationRequest, createEndSessionURL} from './oidc/index.ts'
import {getAdminURL, getCallbackURL, getLoginURL, getOrigin, redirect, safeRedirect, withCookies} from './redirects.ts'
import {
    cookieNames,
    openTransaction,
    parseCookies,
    sealTransaction,
    serializeCookie,
    openSession,
    sealSession,
    type Transaction,
} from './session.ts'
import type {ZitadelResolvedOptions} from './types.ts'
import {syncUser, userDataFromClaims} from './users.ts'

const isSecure = (req: PayloadRequest) => getOrigin(req).startsWith('https:')

const cookieOptions = (req: PayloadRequest, maxAge: number) => ({maxAge, secure: isSecure(req)})

const transactionCookie = async (req: PayloadRequest, transaction: Transaction) =>
    serializeCookie(
        cookieNames(req.payload.config.cookiePrefix).transaction,
        await sealTransaction(req.payload.secret, transaction),
        cookieOptions(req, DEFAULTS.transactionMaxAge),
    )

const expired = (req: PayloadRequest, name: keyof ReturnType<typeof cookieNames>) =>
    serializeCookie(cookieNames(req.payload.config.cookiePrefix)[name], '', cookieOptions(req, 0))

const fail = (req: PayloadRequest, code: string, error?: unknown) => {
    req.payload.logger.error({err: error, msg: `[${PLUGIN_SLUG}] sign-in failed: ${code}`})
    return redirect(getLoginURL(req, code), [expired(req, 'transaction')])
}

const authorize =
    (options: ZitadelResolvedOptions, configured: boolean): PayloadHandler =>
    async req => {
        if (!configured) {
            return fail(req, 'configuration')
        }
        try {
            const {url, transaction} = await createAuthorizationRequest(options, getCallbackURL(req, options))
            const target = safeRedirect(req.query.redirect)
            return redirect(url, [
                await transactionCookie(req, {kind: 'login', ...transaction, ...(target ? {redirect: target} : {})}),
            ])
        } catch (error) {
            return fail(req, 'issuer', error)
        }
    }

const callback =
    (options: ZitadelResolvedOptions): PayloadHandler =>
    async req => {
        const sealed = parseCookies(req.headers).get(cookieNames(req.payload.config.cookiePrefix).transaction)
        const transaction = sealed ? await openTransaction(req.payload.secret, sealed) : null
        if (!transaction || !req.url) {
            return fail(req, 'transaction')
        }
        const url = new URL(req.url)

        if (transaction.kind === 'logout') {
            if (url.searchParams.get('state') !== transaction.state) {
                return fail(req, 'state')
            }
            const cookies = [expired(req, 'transaction')]
            const response = await options.callbacks?.afterLogout?.({req, redirect: transaction.redirect})
            return response ? withCookies(response, cookies) : redirect(getLoginURL(req), cookies)
        }

        let claims, idToken, accessToken, expiresIn
        try {
            ;({claims, idToken, accessToken, expiresIn} = await completeAuthorizationRequest(
                options,
                url,
                getCallbackURL(req, options),
                transaction,
            ))
        } catch (error) {
            return fail(req, 'authorization', error)
        }

        try {
            await syncUser(req.payload, options, claims.sub, userDataFromClaims(claims, options))
        } catch (error) {
            return fail(req, 'user', error)
        }

        // the session can't outlive the access token, it is needed to revalidate the session
        const maxAge = Math.min(options.sessionMaxAge, expiresIn ?? Infinity)
        const cookies = [
            expired(req, 'transaction'),
            serializeCookie(
                cookieNames(req.payload.config.cookiePrefix).session,
                await sealSession(
                    req.payload.secret,
                    options.collection,
                    {
                        sub: claims.sub,
                        idToken,
                        accessToken,
                        ...(typeof claims.sid === 'string' ? {sid: claims.sid} : {}),
                    },
                    maxAge,
                ),
                cookieOptions(req, maxAge),
            ),
        ]
        const response = await options.callbacks?.afterLogin?.({req, redirect: transaction.redirect})
        return response
            ? withCookies(response, cookies)
            : redirect(transaction.redirect ? getOrigin(req) + transaction.redirect : getAdminURL(req), cookies)
    }

const logout =
    (options: ZitadelResolvedOptions, configured: boolean): PayloadHandler =>
    async req => {
        const names = cookieNames(req.payload.config.cookiePrefix)
        const sealed = parseCookies(req.headers).get(names.session)
        const session = sealed ? await openSession(req.payload.secret, options.collection, sealed) : null
        const cookies = [expired(req, 'session')]
        if (configured) {
            try {
                const state = crypto.randomUUID()
                const target = safeRedirect(req.query.redirect)
                const url = await createEndSessionURL(options, getCallbackURL(req, options), state, session?.idToken)
                if (url) {
                    cookies.push(
                        await transactionCookie(req, {kind: 'logout', state, ...(target ? {redirect: target} : {})}),
                    )
                    return redirect(url, cookies)
                }
            } catch (error) {
                req.payload.logger.error({err: error, msg: `[${PLUGIN_SLUG}] end session failed`})
            }
        }
        return redirect(getLoginURL(req), cookies)
    }

export const zitadelEndpoints = (options: ZitadelResolvedOptions, configured: boolean): Endpoint[] => [
    {path: ENDPOINTS.authorize, method: 'get', handler: authorize(options, configured)},
    {path: ENDPOINTS.callback, method: 'get', handler: callback(options)},
    {path: ENDPOINTS.logout, method: 'get', handler: logout(options, configured)},
]
