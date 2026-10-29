import type {PayloadRequest} from 'payload'
import {ENDPOINTS, ERROR_PARAM} from './constants.ts'
import type {ZitadelResolvedOptions} from './types.ts'

/** only same-origin paths are accepted as redirect targets */
export const safeRedirect = (value: unknown): string | undefined =>
    typeof value === 'string' && /^\/(?![/\\])/.test(value) && !/[\r\n]/.test(value) ? value : undefined

export const getOrigin = (req: PayloadRequest) =>
    (req.payload.config.serverURL || (req.url ? new URL(req.url).origin : '')).replace(/\/+$/, '')

export const getCallbackURL = (req: PayloadRequest, {collection}: Pick<ZitadelResolvedOptions, 'collection'>) =>
    `${getOrigin(req)}${req.payload.config.routes.api}/${collection}${ENDPOINTS.callback}`

export const getAdminURL = (req: PayloadRequest, path = '') =>
    `${getOrigin(req)}${req.payload.config.routes.admin}${path}`

export const getLoginURL = (req: PayloadRequest, error?: string) =>
    getAdminURL(req, req.payload.config.admin.routes?.login ?? '/login') +
    (error ? `?${new URLSearchParams({[ERROR_PARAM]: error})}` : '')

export const redirect = (location: string | URL, cookies: string[] = []) => {
    const headers = new Headers({Location: location.toString(), 'Cache-Control': 'no-store'})
    cookies.forEach(cookie => headers.append('Set-Cookie', cookie))
    return new Response(null, {status: 302, headers})
}

/** responses of user callbacks may have immutable headers (e.g. Response.redirect), so they get copied */
export const withCookies = (response: Response, cookies: string[]) => {
    const copy = new Response(response.body, response)
    cookies.forEach(cookie => copy.headers.append('Set-Cookie', cookie))
    return copy
}
