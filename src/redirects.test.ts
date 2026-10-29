import {describe, expect, it} from 'vitest'
import {safeRedirect} from './redirects.ts'

describe('safeRedirect', () => {
    it.each(['/admin', '/admin/collections/users?limit=10', '/'])('accepts %s', path => {
        expect(safeRedirect(path)).toBe(path)
    })

    it.each([
        '//evil.example.com',
        '/\\evil.example.com',
        'https://evil.example.com',
        'admin',
        '/a\r\nSet-Cookie: x',
        1,
    ])('rejects %s', path => {
        expect(safeRedirect(path)).toBeUndefined()
    })
})
