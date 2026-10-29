'use client'
import {useSearchParams, useTranslation} from '@payloadcms/ui'
import {useEffect} from 'react'
import {ERROR_PARAM} from '../constants.ts'
import type {ZitadelTranslationKeys} from '../translations.ts'
import {useEndpoint} from './useEndpoint.ts'

export type AutoRedirectProps = {
    collection: string
    label: string
}

/** skipped when the callback reported an error, so users don't end up in a redirect loop */
export const AutoRedirect = ({collection, label}: AutoRedirectProps) => {
    const {t} = useTranslation<object, ZitadelTranslationKeys>()
    const endpoint = useEndpoint(collection)
    const searchParams = useSearchParams()
    const skip = searchParams.has(ERROR_PARAM)
    const url = endpoint('authorize', searchParams.get('redirect') ?? undefined)

    useEffect(() => {
        if (!skip) {
            window.location.replace(url)
        }
    }, [skip, url])

    return skip ? null : <p>{t('zitadel:redirecting', {label})}</p>
}
