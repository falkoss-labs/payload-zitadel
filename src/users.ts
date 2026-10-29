import type {CollectionSlug, Payload, TypeWithID} from 'payload'
import {ROLES_CLAIM} from './constants.ts'
import type {ZitadelResolvedOptions} from './types.ts'

export type ZitadelUser = TypeWithID & Record<string, unknown>

type Claims = Readonly<Record<string, unknown>>

const text = (value: unknown) => (typeof value === 'string' && value ? value : undefined)

const roles = (value: unknown) =>
    value && typeof value === 'object' && !Array.isArray(value) ? Object.keys(value).sort() : undefined

/** maps ID token or introspection claims onto the configured fields, claims missing in the source are left out */
export const userDataFromClaims = (claims: Claims, {fields}: Pick<ZitadelResolvedOptions, 'fields'>) =>
    Object.fromEntries(
        Object.entries({
            [fields.name.name]: text(claims.name),
            [fields.email.name]: text(claims.email),
            [fields.image.name]: text(claims.picture),
            [fields.roles.name]: roles(claims[ROLES_CLAIM]),
        }).filter(([, value]) => value !== undefined),
    )

/** the collection is configurable, so the generated types of the project can't be known here */
const slug = (collection: string) => collection as CollectionSlug

const equals = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null)

export const findUser = async (
    payload: Payload,
    {collection, fields}: Pick<ZitadelResolvedOptions, 'collection' | 'fields'>,
    sub: string,
): Promise<ZitadelUser | null> => {
    const {docs} = await payload.find({
        collection: slug(collection),
        where: {[fields.zitadelId.name]: {equals: sub}},
        limit: 1,
        depth: 0,
        pagination: false,
        overrideAccess: true,
    })
    return (docs[0] as unknown as ZitadelUser | undefined) ?? null
}

/** creates the shadow user or updates it, but only when the data from Zitadel changed (every update is a version) */
export const syncUser = async (
    payload: Payload,
    options: Pick<ZitadelResolvedOptions, 'collection' | 'fields'>,
    sub: string,
    data: Record<string, unknown>,
): Promise<ZitadelUser> => {
    const user = await findUser(payload, options, sub)
    if (!user) {
        return (await payload.create({
            collection: slug(options.collection),
            data: {...data, [options.fields.zitadelId.name]: sub} as never,
            overrideAccess: true,
        })) as unknown as ZitadelUser
    }
    if (Object.entries(data).every(([key, value]) => equals(user[key], value))) {
        return user
    }
    return (await payload.update({
        collection: slug(options.collection),
        id: user.id,
        data: data as never,
        depth: 0,
        overrideAccess: true,
    })) as unknown as ZitadelUser
}
