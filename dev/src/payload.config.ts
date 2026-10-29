import {zitadelPlugin} from '@falkoss/payload-zitadel'
import {sqliteAdapter} from '@payloadcms/db-sqlite'
import {lexicalEditor} from '@payloadcms/richtext-lexical'
import path from 'node:path'
import {buildConfig} from 'payload'
import {Users} from './collections/Users.ts'

export default buildConfig({
    admin: {
        user: Users.slug,
        importMap: {
            baseDir: import.meta.dirname,
            importMapFile: path.resolve(import.meta.dirname, 'app', '_payload', 'importMap.js'),
        },
    },
    collections: [Users],
    editor: lexicalEditor(),
    secret: process.env.PAYLOAD_SECRET ?? 'dev-secret-do-not-use-in-production',
    serverURL: process.env.SERVER_URL ?? 'http://localhost:3000',
    typescript: {
        outputFile: path.resolve(import.meta.dirname, 'payload-types.ts'),
    },
    db: sqliteAdapter({
        client: {url: process.env.DATABASE_URL ?? 'file:./dev.db'},
    }),
    plugins: [
        zitadelPlugin({
            admin: {autoRedirect: process.env.ZITADEL_AUTO_REDIRECT === 'true'},
            session: {revalidate: Number(process.env.ZITADEL_SESSION_REVALIDATE ?? 300)},
        }),
    ],
})
