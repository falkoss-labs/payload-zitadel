# @falkoss/payload-zitadel

[![npm beta](https://img.shields.io/npm/v/@falkoss/payload-zitadel/beta?label=npm%20beta)](https://www.npmjs.com/package/@falkoss/payload-zitadel)
[![Payload](https://img.shields.io/badge/Payload-4-blue)](https://payloadcms.com)
[![License: MIT](https://img.shields.io/badge/license-MIT-green)](LICENSE)

Authentication for [Payload CMS](https://payloadcms.com) 4 via [Zitadel](https://zitadel.com).
The auth collection becomes a shadow of the users in Zitadel: sign-in, sign-out and roles are managed there.

> **Status: pre-release.** Tracks the Payload 4 beta, APIs may still change – do not use in production yet. Successor of [payload-zitadel-plugin](https://github.com/w41x/payload-zitadel-plugin)
> (Payload 3).

Works with every Payload framework adapter (TanStack Start, Next.js), the plugin itself has no framework dependency.

## Install

```shell
pnpm add @falkoss/payload-zitadel@beta
```

## Configuration

```ts
import {zitadelPlugin} from '@falkoss/payload-zitadel'

export default buildConfig({
    // ...
    plugins: [zitadelPlugin()],
})
```

Without options the plugin reads `ZITADEL_ISSUER` and `ZITADEL_CLIENT_ID` and attaches to the collection in `admin.user`.
In Zitadel create a project with a web application (PKCE) and register
`{serverURL}/api/{collection}/zitadel/callback` as redirect URI and post logout redirect URI.

| Option       | Default                            | Description                                                                   |
| ------------ | ---------------------------------- | ----------------------------------------------------------------------------- |
| `enabled`    | `true`                             | turns the plugin off, fields stay in place to keep the database schema stable |
| `issuer`     | `ZITADEL_ISSUER`                   | URL of the Zitadel instance                                                   |
| `clientId`   | `ZITADEL_CLIENT_ID`                | client ID of the web application                                              |
| `collection` | `admin.user`                       | auth collection to attach to                                                  |
| `scopes`     | openid, profile, email, roles      | requested scopes                                                              |
| `session`    | `{maxAge: 28800, revalidate: 300}` | lifetime of the session and interval of the checks against Zitadel in seconds |
| `api`        | `ZITADEL_API_*`                    | introspection credentials to authenticate API clients via bearer tokens¹      |
| `fields`     |                                    | rename, relabel or hide the fields the plugin adds                            |
| `admin`      |                                    | `autoRedirect`, `loginButton`, `logoutButton`, `avatar`                       |
| `callbacks`  |                                    | `afterLogin`, `afterLogout` to control the redirects                          |

The session lives in an encrypted cookie and is checked against Zitadel (userinfo) every `session.revalidate` seconds:
signing out in Zitadel, locking or deactivating the user ends it, changes to profile and roles are picked up. If Zitadel
can't be reached, the session stays valid until it expires. The built-in logout views of Payload end the Zitadel session
as well.

¹ With `api` configured, `Authorization: Bearer` belongs to Zitadel: the plugin removes `Bearer` from `auth.jwtOrder`, so
Payload's own JWTs are only accepted as `JWT` header or cookie.

## Development

Requires Node 26, pnpm 12 and Docker.

```shell
pnpm install
pnpm --filter dev zitadel:up      # Zitadel on :8080, login UI on :3001
pnpm --filter dev zitadel:setup   # project, apps and test user, writes dev/.env
pnpm dev                          # TanStack Start dev app on :3000
```

| Script                      | What it does                                    |
| --------------------------- | ----------------------------------------------- |
| `pnpm test`                 | unit (`src/**/*.test.ts`) and integration tests |
| `pnpm test:e2e`             | Playwright against the dev app (and Zitadel)    |
| `pnpm typecheck`            | TypeScript 7 for plugin and dev app             |
| `pnpm lint` / `pnpm format` | oxlint / oxfmt                                  |
| `pnpm changeset`            | describe a change for the next release          |

Releases: describe changes with `pnpm changeset`, then `pnpm release:prepare` applies them (version, CHANGELOG) and
commits. Push and create a GitHub release with the printed tag (`v<version>`, pre-release for betas): the release workflow
stages it on npm via trusted publishing, it goes live after approving with 2FA (`npm stage approve <id>`).

## License

[MIT](LICENSE)
