'use client'
import {useAuth} from '@payloadcms/ui'

export type AvatarProps = {
    imageField: string
    nameField: string
    active?: boolean
}

const SIZE = 24

const initials = (name: unknown) =>
    typeof name === 'string'
        ? name
              .split(/\s+/)
              .filter(Boolean)
              .slice(0, 2)
              .map(part => part[0]?.toUpperCase())
              .join('')
        : ''

/** the Zitadel profile picture, or the initials of the user when there is none */
export const Avatar = ({imageField, nameField, active}: AvatarProps) => {
    const {user} = useAuth()
    const data = user as Record<string, unknown> | null
    const src = data?.[imageField]
    const className = ['avatar', active ? 'avatar--active' : ''].filter(Boolean).join(' ')
    const style = {width: SIZE, height: SIZE, borderRadius: '50%'}

    return typeof src === 'string' && src ? (
        <img className={className} src={src} alt="" width={SIZE} height={SIZE} style={style} />
    ) : (
        <span
            className={className}
            aria-hidden
            style={{
                ...style,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: SIZE / 2.4,
                fontWeight: 600,
                background: 'var(--theme-elevation-150)',
                color: 'var(--theme-elevation-800)',
            }}
        >
            {initials(data?.[nameField] ?? data?.email)}
        </span>
    )
}
