'use client'
import {useSearchParams} from '@payloadcms/ui'
import {useEffect} from 'react'
import {useEndpoint} from './useEndpoint.ts'

export type LogoutRedirectProps = {
    collection: string
}

/** replaces the built-in logout views, which would only clear the Payload cookie and leave the Zitadel session alive */
export const LogoutRedirect = ({collection}: LogoutRedirectProps) => {
    const endpoint = useEndpoint(collection)
    const url = endpoint('logout', useSearchParams().get('redirect') ?? undefined)

    useEffect(() => {
        window.location.replace(url)
    }, [url])

    return null
}
