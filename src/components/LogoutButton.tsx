'use client'
import {LogOutIcon, useTranslation} from '@payloadcms/ui'
import {useEndpoint} from './useEndpoint.ts'

export type LogoutButtonProps = {
    collection: string
}

export const LogoutButton = ({collection}: LogoutButtonProps) => {
    const {t} = useTranslation()
    const endpoint = useEndpoint(collection)
    return (
        <a
            className="nav__log-out"
            href={endpoint('logout')}
            aria-label={t('authentication:logOut')}
            title={t('authentication:logOut')}
        >
            <LogOutIcon />
        </a>
    )
}
