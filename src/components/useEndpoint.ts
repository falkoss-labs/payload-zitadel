'use client'
import {useConfig} from '@payloadcms/ui'
import {ENDPOINTS} from '../constants.ts'

export const useEndpoint = (collection: string) => {
    const {
        config: {serverURL, routes},
    } = useConfig()
    return (endpoint: keyof typeof ENDPOINTS, redirect?: string) =>
        `${serverURL}${routes.api}/${collection}${ENDPOINTS[endpoint]}${redirect ? `?${new URLSearchParams({redirect})}` : ''}`
}
