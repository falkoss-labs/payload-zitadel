import {type CollectionConfig, type Config, definePlugin} from 'payload'
import {PLUGIN_SLUG} from './constants.ts'
import {zitadelEndpoints} from './endpoints.ts'
import {zitadelFields} from './fields.ts'
import {resolveOptions} from './options.ts'
import {zitadelStrategy} from './strategy.ts'
import {translations} from './translations.ts'
import type {ZitadelPluginOptions, ZitadelResolvedOptions} from './types.ts'

const CLIENT = '@falkoss/payload-zitadel/client'

const extendCollection = (
    collection: CollectionConfig,
    options: ZitadelResolvedOptions,
    configured: boolean,
): CollectionConfig => {
    const fields = [...collection.fields, ...zitadelFields(options.fields)]
    if (!options.enabled) {
        return {...collection, fields}
    }
    const auth = typeof collection.auth === 'object' ? collection.auth : {}
    return {
        ...collection,
        auth: {
            ...auth,
            disableLocalStrategy: true,
            strategies: [...(auth.strategies ?? []), zitadelStrategy(options)],
        },
        endpoints: [...(collection.endpoints || []), ...zitadelEndpoints(options, configured)],
        fields,
    }
}

const extendAdmin = (
    admin: Config['admin'] = {},
    {collection, admin: ui, fields}: ZitadelResolvedOptions,
): NonNullable<Config['admin']> => {
    const label = (ui.loginButton && ui.loginButton.label) || 'Zitadel'
    const login = ui.autoRedirect
        ? [{path: `${CLIENT}#AutoRedirect`, clientProps: {collection, label}}]
        : ui.loginButton
          ? [{path: `${CLIENT}#LoginButton`, clientProps: {collection, label}}]
          : []
    return {
        ...admin,
        ...(ui.avatar
            ? {
                  avatar: {
                      Component: {
                          path: `${CLIENT}#Avatar`,
                          clientProps: {imageField: fields.image.name, nameField: fields.name.name},
                      },
                  },
              }
            : {}),
        components: {
            ...admin.components,
            afterLogin: [...(admin.components?.afterLogin ?? []), ...login],
            // own views of the project win, the plugin only replaces the built-in ones
            views: {
                logout: {Component: {path: `${CLIENT}#LogoutRedirect`, clientProps: {collection}}},
                inactivity: {Component: {path: `${CLIENT}#LogoutRedirect`, clientProps: {collection}}},
                ...admin.components?.views,
            },
            ...(ui.logoutButton
                ? {
                      logout: {
                          ...admin.components?.logout,
                          Button: {path: `${CLIENT}#LogoutButton`, clientProps: {collection}},
                      },
                  }
                : {}),
        },
    }
}

export const zitadelPlugin = definePlugin<ZitadelPluginOptions | undefined>({
    slug: PLUGIN_SLUG,
    plugin: ({config, options = {}}) => {
        const {resolved, issues} = resolveOptions(options, config)

        if (resolved.enabled && issues.length) {
            console.warn(`[${PLUGIN_SLUG}] configuration issues:\n${issues.map(issue => `  - ${issue}`).join('\n')}`)
        }

        return {
            ...config,
            ...(resolved.enabled ? {admin: extendAdmin(config.admin, resolved)} : {}),
            // with introspection, bearer tokens belong to Zitadel, Payload would try to decode them as its own JWTs
            ...(resolved.enabled && resolved.api
                ? {
                      auth: {
                          ...config.auth,
                          jwtOrder: (config.auth?.jwtOrder ?? ['JWT', 'Bearer', 'cookie']).filter(
                              source => source !== 'Bearer',
                          ),
                      },
                  }
                : {}),
            collections: (config.collections ?? []).map(collection =>
                collection.slug === resolved.collection
                    ? extendCollection(collection, resolved, !issues.length)
                    : collection,
            ),
            i18n: {
                ...config.i18n,
                translations: {
                    ...config.i18n?.translations,
                    de: {...translations.de, ...config.i18n?.translations?.de},
                    en: {...translations.en, ...config.i18n?.translations?.en},
                },
            },
        }
    },
})

export {ENDPOINT_PREFIX, ENDPOINTS} from './constants.ts'
export {resolveOptions} from './options.ts'
export type {
    ZitadelAPIConfig,
    ZitadelClientProps,
    ZitadelFieldOverride,
    ZitadelKeyFile,
    ZitadelPluginOptions,
    ZitadelRedirectArgs,
} from './types.ts'
