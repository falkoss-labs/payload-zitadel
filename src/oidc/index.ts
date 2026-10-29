/**
 * the only place that knows about oauth4webapi, the rest of the plugin uses these functions
 */
import {createPrivateKey} from 'node:crypto'
import * as oauth from 'oauth4webapi'
import type {ZitadelAPIConfig, ZitadelResolvedOptions} from '../types.ts'

export type IdTokenClaims = oauth.IDToken
export type Introspection = oauth.IntrospectionResponse

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]'])

/** plain http is only accepted for an issuer on the local machine */
export const isInsecureLocalIssuer = (issuer: URL) => issuer.protocol === 'http:' && LOCAL_HOSTS.has(issuer.hostname)

const requestOptions = (issuer: URL) => (isInsecureLocalIssuer(issuer) ? {[oauth.allowInsecureRequests]: true} : {})

const DISCOVERY_TTL = 60 * 60 * 1000

const discoveries = new Map<string, {as: Promise<oauth.AuthorizationServer>; expires: number}>()

export const discover = (issuer: string): Promise<oauth.AuthorizationServer> => {
    const cached = discoveries.get(issuer)
    if (cached && cached.expires > Date.now()) {
        return cached.as
    }
    const url = new URL(issuer)
    const as = oauth
        .discoveryRequest(url, requestOptions(url))
        .then(response => oauth.processDiscoveryResponse(url, response))
    as.catch(() => discoveries.delete(issuer))
    discoveries.set(issuer, {as, expires: Date.now() + DISCOVERY_TTL})
    return as
}

export const resetDiscoveryCache = () => discoveries.clear()

export type AuthorizationTransaction = {
    state: string
    nonce: string
    codeVerifier: string
}

export const createAuthorizationRequest = async (
    {issuer, clientId, scopes}: Pick<ZitadelResolvedOptions, 'issuer' | 'clientId' | 'scopes'>,
    redirectUri: string,
): Promise<{url: URL; transaction: AuthorizationTransaction}> => {
    const as = await discover(issuer)
    if (!as.authorization_endpoint) {
        throw new Error('issuer has no authorization endpoint')
    }
    const transaction = {
        state: oauth.generateRandomState(),
        nonce: oauth.generateRandomNonce(),
        codeVerifier: oauth.generateRandomCodeVerifier(),
    }
    const url = new URL(as.authorization_endpoint)
    url.search = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: 'code',
        scope: scopes.join(' '),
        state: transaction.state,
        nonce: transaction.nonce,
        code_challenge: await oauth.calculatePKCECodeChallenge(transaction.codeVerifier),
        code_challenge_method: 'S256',
    }).toString()
    return {url, transaction}
}

export type AuthorizationResult = {
    claims: IdTokenClaims
    idToken: string
    accessToken: string
    /** lifetime of the access token in seconds, if the server told */
    expiresIn: number | undefined
}

/** validates the callback parameters, redeems the code and returns the validated ID token claims */
export const completeAuthorizationRequest = async (
    {issuer, clientId}: Pick<ZitadelResolvedOptions, 'issuer' | 'clientId'>,
    callbackURL: URL,
    redirectUri: string,
    transaction: AuthorizationTransaction,
): Promise<AuthorizationResult> => {
    const as = await discover(issuer)
    const client: oauth.Client = {client_id: clientId}
    const parameters = oauth.validateAuthResponse(as, client, callbackURL, transaction.state)
    const response = await oauth.authorizationCodeGrantRequest(
        as,
        client,
        oauth.None(),
        parameters,
        redirectUri,
        transaction.codeVerifier,
        requestOptions(new URL(issuer)),
    )
    const result = await oauth.processAuthorizationCodeResponse(as, client, response, {
        expectedNonce: transaction.nonce,
        requireIdToken: true,
    })
    const claims = oauth.getValidatedIdTokenClaims(result)
    if (!claims || !result.id_token) {
        throw new Error('token response contains no ID token')
    }
    return {claims, idToken: result.id_token, accessToken: result.access_token, expiresIn: result.expires_in}
}

/**
 * fetches the current claims of the user, null when Zitadel no longer accepts the access token
 * (session ended, user locked or deactivated), throws on any other failure
 */
export const fetchUserInfo = async (
    {issuer, clientId}: Pick<ZitadelResolvedOptions, 'issuer' | 'clientId'>,
    accessToken: string,
    sub: string,
): Promise<oauth.UserInfoResponse | null> => {
    const as = await discover(issuer)
    const client: oauth.Client = {client_id: clientId}
    const response = await oauth.userInfoRequest(as, client, accessToken, requestOptions(new URL(issuer)))
    // with or without WWW-Authenticate challenge, these mean the token is no longer accepted
    if (response.status === 401 || response.status === 403) {
        return null
    }
    return oauth.processUserInfoResponse(as, client, sub, response)
}

export const createEndSessionURL = async (
    {issuer, clientId}: Pick<ZitadelResolvedOptions, 'issuer' | 'clientId'>,
    postLogoutRedirectUri: string,
    state: string,
    idTokenHint?: string,
): Promise<URL | null> => {
    const as = await discover(issuer)
    if (!as.end_session_endpoint) {
        return null
    }
    const url = new URL(as.end_session_endpoint)
    url.search = new URLSearchParams({
        client_id: clientId,
        post_logout_redirect_uri: postLogoutRedirectUri,
        state,
        ...(idTokenHint ? {id_token_hint: idTokenHint} : {}),
    }).toString()
    return url
}

const apiClients = new WeakMap<ZitadelAPIConfig, Promise<{client: oauth.Client; auth: oauth.ClientAuth}>>()

const apiClient = (api: ZitadelAPIConfig) => {
    let client = apiClients.get(api)
    if (!client) {
        client = Promise.resolve().then(() =>
            api.type === 'basic'
                ? {client: {client_id: api.clientId}, auth: oauth.ClientSecretBasic(api.clientSecret)}
                : {
                      client: {client_id: api.key.clientId},
                      auth: oauth.PrivateKeyJwt({
                          key: createPrivateKey(api.key.key).toCryptoKey(
                              {name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256'},
                              false,
                              ['sign'],
                          ) as unknown as CryptoKey,
                          kid: api.key.keyId,
                      }),
                  },
        )
        apiClients.set(api, client)
    }
    return client
}

/** returns the introspection result for active tokens, null otherwise */
export const introspect = async (
    issuer: string,
    api: ZitadelAPIConfig,
    token: string,
): Promise<Introspection | null> => {
    const as = await discover(issuer)
    const {client, auth} = await apiClient(api)
    const response = await oauth.introspectionRequest(as, client, auth, token, requestOptions(new URL(issuer)))
    const result = await oauth.processIntrospectionResponse(as, client, response)
    return result.active ? result : null
}
