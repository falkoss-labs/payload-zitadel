import type {Config} from 'payload'
import {DEFAULT_SCOPES, DEFAULTS, ENV} from './constants.ts'
import type {
    ZitadelAPIConfig,
    ZitadelFieldsConfig,
    ZitadelKeyFile,
    ZitadelPluginOptions,
    ZitadelResolvedOptions,
} from './types.ts'

type Env = Record<string, string | undefined>

const DEFAULT_FIELDS: ZitadelFieldsConfig = {
    zitadelId: {name: 'zitadelId', label: 'Zitadel ID'},
    name: {name: 'name'},
    email: {name: 'email'},
    image: {name: 'image'},
    roles: {name: 'roles'},
}

const resolveFields = (fields: ZitadelPluginOptions['fields'] = {}): ZitadelFieldsConfig =>
    Object.fromEntries(
        Object.entries(DEFAULT_FIELDS).map(([key, field]) => [
            key,
            {...field, ...fields[key as keyof ZitadelFieldsConfig]},
        ]),
    ) as ZitadelFieldsConfig

const resolveAPI = (api: ZitadelPluginOptions['api'], env: Env, issues: string[]): ZitadelAPIConfig | false => {
    if (api !== undefined) {
        return api
    }
    const key = env[ENV.apiKey]
    if (key) {
        try {
            return {type: 'jwt', key: JSON.parse(key) as ZitadelKeyFile}
        } catch {
            issues.push(`${ENV.apiKey} is not valid JSON`)
            return false
        }
    }
    const clientId = env[ENV.apiClientId]
    if (clientId) {
        const clientSecret = env[ENV.apiClientSecret]
        if (clientSecret) {
            return {type: 'basic', clientId, clientSecret}
        }
        issues.push(`${ENV.apiClientId} is set, but ${ENV.apiClientSecret} is missing`)
    }
    return false
}

export const resolveOptions = (
    options: ZitadelPluginOptions,
    config: Pick<Config, 'admin' | 'collections'>,
    env: Env = process.env,
): {resolved: ZitadelResolvedOptions; issues: string[]} => {
    const issues: string[] = []

    const issuer = (options.issuer ?? env[ENV.issuer] ?? '').replace(/\/+$/, '')
    const clientId = options.clientId ?? env[ENV.clientId] ?? ''
    const collection = options.collection ?? config.admin?.user ?? config.collections?.find(({auth}) => auth)?.slug

    if (!issuer) {
        issues.push(`no issuer configured (option "issuer" or ${ENV.issuer})`)
    } else if (!URL.canParse(issuer)) {
        issues.push(`issuer "${issuer}" is not a valid URL`)
    }
    if (!clientId) {
        issues.push(`no client ID configured (option "clientId" or ${ENV.clientId})`)
    }
    if (!collection) {
        issues.push('no auth collection found (option "collection" or admin.user)')
    } else if (!config.collections?.some(({slug, auth}) => slug === collection && auth)) {
        issues.push(`collection "${collection}" does not exist or is not auth-enabled`)
    }

    return {
        issues,
        resolved: {
            enabled: options.enabled ?? true,
            issuer,
            clientId,
            collection: collection ?? '',
            strategyName: options.strategyName ?? DEFAULTS.strategyName,
            scopes: options.scopes ?? [...DEFAULT_SCOPES],
            sessionMaxAge: options.session?.maxAge ?? DEFAULTS.sessionMaxAge,
            sessionRevalidate: options.session?.revalidate ?? DEFAULTS.sessionRevalidate,
            api: resolveAPI(options.api, env, issues),
            fields: resolveFields(options.fields),
            admin: {
                autoRedirect: options.admin?.autoRedirect ?? false,
                loginButton: options.admin?.loginButton === false ? false : {label: options.admin?.loginButton?.label},
                logoutButton: options.admin?.logoutButton ?? true,
                avatar: options.admin?.avatar ?? true,
            },
            callbacks: options.callbacks,
        },
    }
}
