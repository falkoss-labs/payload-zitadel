export const PLUGIN_SLUG = 'plugin-zitadel'

export const ENDPOINT_PREFIX = '/zitadel'

export const ENDPOINTS = {
    authorize: `${ENDPOINT_PREFIX}/authorize`,
    callback: `${ENDPOINT_PREFIX}/callback`,
    logout: `${ENDPOINT_PREFIX}/logout`,
} as const

export const COOKIES = {
    session: 'zitadel-session',
    transaction: 'zitadel-tx',
} as const

/** query parameter on the admin login view when the sign-in failed, also stops the auto redirect */
export const ERROR_PARAM = 'zitadel-error'

export const ENV = {
    issuer: 'ZITADEL_ISSUER',
    clientId: 'ZITADEL_CLIENT_ID',
    apiKey: 'ZITADEL_API_KEY',
    apiClientId: 'ZITADEL_API_CLIENT_ID',
    apiClientSecret: 'ZITADEL_API_CLIENT_SECRET',
} as const

export const ROLES_CLAIM = 'urn:zitadel:iam:org:project:roles'

export const DEFAULT_SCOPES = ['openid', 'profile', 'email', 'urn:zitadel:iam:org:projects:roles'] as const

export const DEFAULTS = {
    strategyName: 'zitadel',
    sessionMaxAge: 60 * 60 * 8,
    sessionRevalidate: 60 * 5,
    transactionMaxAge: 60 * 5,
} as const
