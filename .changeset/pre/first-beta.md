---
'@falkoss/payload-zitadel': major
---

First beta for Payload CMS 4, successor of `payload-zitadel-plugin` (Payload 3).

- sign-in via Zitadel with authorization code flow, PKCE, state and nonce
- shadow users in the auth collection, profile and roles synced from Zitadel
- encrypted session, revalidated against Zitadel so locked users and ended sessions are noticed
- logout ends the Zitadel session, also through the built-in logout views of Payload
- API clients authenticate with bearer tokens via introspection (basic auth or JSON key)
- admin components: login button or auto redirect, logout button, avatar
- independent of the framework adapter (TanStack Start, Next.js)

Breaking compared to `payload-zitadel-plugin`: new package name, ESM only, options and endpoint paths
(`/api/{collection}/zitadel/{authorize,callback,logout}`) changed, see the README.
