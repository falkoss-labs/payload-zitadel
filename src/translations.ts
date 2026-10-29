export const translations = {
    de: {
        zitadel: {
            loginWith: 'Anmelden mit {{label}}',
            redirecting: 'Weiterleitung zu {{label}} …',
        },
    },
    en: {
        zitadel: {
            loginWith: 'Sign in with {{label}}',
            redirecting: 'Redirecting to {{label}} …',
        },
    },
}

export type ZitadelTranslationKeys = `zitadel:${keyof (typeof translations)['en']['zitadel']}`
