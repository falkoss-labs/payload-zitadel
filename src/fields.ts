import type {Field} from 'payload'
import type {ZitadelFieldsConfig} from './types.ts'

const readOnly = (hidden: boolean | undefined) => ({readOnly: true, ...(hidden ? {hidden} : {})})

export const zitadelFields = ({zitadelId, name, email, image, roles}: ZitadelFieldsConfig): Field[] => [
    {
        name: zitadelId.name,
        ...(zitadelId.label ? {label: zitadelId.label} : {}),
        type: 'text',
        index: true,
        unique: true,
        required: true,
        admin: readOnly(zitadelId.hidden),
    },
    {
        name: name.name,
        ...(name.label ? {label: name.label} : {}),
        type: 'text',
        admin: readOnly(name.hidden),
    },
    {
        name: email.name,
        ...(email.label ? {label: email.label} : {}),
        type: 'email',
        admin: readOnly(email.hidden),
    },
    {
        name: image.name,
        ...(image.label ? {label: image.label} : {}),
        type: 'text',
        admin: readOnly(image.hidden),
    },
    {
        name: roles.name,
        ...(roles.label ? {label: roles.label} : {}),
        type: 'text',
        hasMany: true,
        admin: readOnly(roles.hidden),
    },
]
