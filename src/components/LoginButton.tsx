'use client'
import {Button, useSearchParams, useTranslation} from '@payloadcms/ui'
import type {ZitadelTranslationKeys} from '../translations.ts'
import {useEndpoint} from './useEndpoint.ts'

export type LoginButtonProps = {
    collection: string
    label: string
}

export const LoginButton = ({collection, label}: LoginButtonProps) => {
    const {t} = useTranslation<object, ZitadelTranslationKeys>()
    const endpoint = useEndpoint(collection)
    const redirect = useSearchParams().get('redirect') ?? undefined
    return (
        <Button el="anchor" url={endpoint('authorize', redirect)} buttonStyle="primary" size="large">
            {t('zitadel:loginWith', {label})}
        </Button>
    )
}
