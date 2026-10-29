import {describe, expect, it} from 'vitest'
import {openSession, openTransaction, parseCookies, sealSession, sealTransaction, serializeCookie} from './session.ts'

describe('cookies', () => {
    it('round-trips values', () => {
        const cookie = serializeCookie('a', 'x=y;z', {maxAge: 60, secure: true}).split(';')[0]!
        expect(parseCookies(new Headers({cookie: `${cookie}; b=2`})).get('a')).toBe('x=y;z')
    })

    it('sets restrictive attributes', () => {
        expect(serializeCookie('a', 'b', {maxAge: 60, secure: true})).toBe(
            'a=b; Path=/; HttpOnly; SameSite=Lax; Max-Age=60; Secure',
        )
        expect(serializeCookie('a', '', {maxAge: 0, secure: false})).toContain('Expires=Thu, 01 Jan 1970')
    })
})

describe('session', () => {
    it('opens sessions it sealed', async () => {
        const token = await sealSession('secret', 'users', {sub: '1', sid: 's', idToken: 'id'}, 60)
        expect(await openSession('secret', 'users', token)).toEqual({sub: '1', sid: 's', idToken: 'id'})
    })

    it('rejects other secrets, other collections and expired sessions', async () => {
        const token = await sealSession('secret', 'users', {sub: '1'}, 60)
        expect(await openSession('other', 'users', token)).toBeNull()
        expect(await openSession('secret', 'admins', token)).toBeNull()
        expect(await openSession('secret', 'users', await sealSession('secret', 'users', {sub: '1'}, -1))).toBeNull()
    })

    it('does not accept transactions as sessions', async () => {
        const transaction = await sealTransaction('secret', {kind: 'logout', state: 's'})
        expect(await openSession('secret', 'users', transaction)).toBeNull()
        expect(await openTransaction('secret', transaction)).toEqual({kind: 'logout', state: 's'})
    })
})
