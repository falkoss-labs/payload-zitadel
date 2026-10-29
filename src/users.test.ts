import {describe, expect, it} from 'vitest'
import {ROLES_CLAIM} from './constants.ts'
import {resolveOptions} from './options.ts'
import {userDataFromClaims} from './users.ts'

const {resolved} = resolveOptions(
    {fields: {image: {name: 'avatar'}}},
    {admin: {user: 'users'}, collections: [{slug: 'users', auth: true, fields: []}]},
    {},
)

describe('userDataFromClaims', () => {
    it('maps claims onto the configured fields with sorted roles', () => {
        expect(
            userDataFromClaims(
                {name: 'Ada', email: 'ada@example.com', picture: 'https://img', [ROLES_CLAIM]: {editor: {}, admin: {}}},
                resolved,
            ),
        ).toEqual({name: 'Ada', email: 'ada@example.com', avatar: 'https://img', roles: ['admin', 'editor']})
    })

    it('leaves out claims that are missing, so they are not wiped on update', () => {
        expect(userDataFromClaims({name: 'Ada'}, resolved)).toEqual({name: 'Ada'})
    })
})
