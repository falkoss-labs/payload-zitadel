import type {CollectionSlug, PayloadRequest, StaticLabel} from 'payload'

export type ZitadelFieldOverride = {
    name?: string
    label?: StaticLabel
    hidden?: boolean
}

export type ZitadelFieldKey = 'zitadelId' | 'name' | 'email' | 'image' | 'roles'

export type ZitadelFieldsConfig = Record<
    ZitadelFieldKey,
    Required<Pick<ZitadelFieldOverride, 'name'>> & ZitadelFieldOverride
>

/** content of the JSON key file Zitadel offers for download when creating a key for an API application */
export type ZitadelKeyFile = {
    type?: 'application'
    keyId: string
    key: string
    appId: string
    clientId: string
}

export type ZitadelAPIConfig =
    | {type: 'jwt'; key: ZitadelKeyFile}
    | {type: 'basic'; clientId: string; clientSecret: string}

export type ZitadelRedirectArgs = {
    req: PayloadRequest
    /** path relative to the server URL the flow was started from, if any */
    redirect: string | undefined
}

export type ZitadelPluginOptions = {
    /** disables all behaviour of the plugin, the fields stay in place to keep the database schema stable */
    enabled?: boolean
    /** URL of the Zitadel instance, falls back to `ZITADEL_ISSUER` */
    issuer?: string
    /** client ID of the Zitadel web application (PKCE), falls back to `ZITADEL_CLIENT_ID` */
    clientId?: string
    /** auth collection the plugin attaches to, defaults to `admin.user` */
    collection?: CollectionSlug
    strategyName?: string
    scopes?: string[]
    session?: {
        /** lifetime of the session in seconds, capped by the lifetime of the Zitadel access token */
        maxAge?: number
        /**
         * interval in seconds in which the session gets checked against Zitadel (userinfo), which also
         * refreshes profile and roles, `false` trusts the session until it expires
         */
        revalidate?: number | false
    }
    /** credentials for token introspection, enables authentication of API clients via bearer tokens */
    api?: ZitadelAPIConfig | false
    fields?: Partial<Record<ZitadelFieldKey, ZitadelFieldOverride>>
    admin?: {
        /** redirects the admin login view straight to Zitadel */
        autoRedirect?: boolean
        loginButton?: false | {label?: string}
        /** replaces the logout button so the Zitadel session gets terminated as well */
        logoutButton?: boolean
        /** uses the Zitadel profile picture as avatar */
        avatar?: boolean
    }
    callbacks?: {
        afterLogin?: (args: ZitadelRedirectArgs) => Promise<Response> | Response
        afterLogout?: (args: ZitadelRedirectArgs) => Promise<Response> | Response
    }
}

export type ZitadelResolvedOptions = {
    enabled: boolean
    issuer: string
    clientId: string
    collection: string
    strategyName: string
    scopes: string[]
    sessionMaxAge: number
    sessionRevalidate: number | false
    api: ZitadelAPIConfig | false
    fields: ZitadelFieldsConfig
    admin: {
        autoRedirect: boolean
        loginButton: false | {label: string | undefined}
        logoutButton: boolean
        avatar: boolean
    }
    callbacks: ZitadelPluginOptions['callbacks']
}

export type ZitadelClientProps = {
    /** path of the plugin endpoints relative to the API route, e.g. `/users/zitadel` */
    basePath: string
}
