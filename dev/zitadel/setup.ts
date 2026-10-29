/**
 * provisions the local Zitadel from compose.yaml for development and e2e tests:
 * project with roles, PKCE web app, API app (basic auth) and a test user,
 * then writes the resulting credentials to dev/.env
 */
import {existsSync, readFileSync, writeFileSync} from 'node:fs'
import path from 'node:path'

const issuer = process.env.ZITADEL_ISSUER ?? 'http://localhost:8080'
const serverURL = process.env.SERVER_URL ?? 'http://localhost:3000'
const envFile = path.resolve(import.meta.dirname, '..', '.env')
const patFile = path.resolve(import.meta.dirname, '.secrets', 'admin.pat')

const testUser = {username: 'test', email: 'test@example.com', password: 'Password1!'}

const pat = readFileSync(patFile, 'utf8').trim()

const api = async <T>(method: string, route: string, body?: unknown): Promise<T> => {
    const response = await fetch(issuer + route, {
        method,
        headers: {Authorization: `Bearer ${pat}`, 'Content-Type': 'application/json'},
        ...(body ? {body: JSON.stringify(body)} : {}),
    })
    if (!response.ok) {
        throw new Error(`${method} ${route} failed: ${response.status} ${await response.text()}`)
    }
    return (await response.json()) as T
}

const existing = await api<{result?: unknown[]}>('POST', '/management/v1/projects/_search', {
    queries: [{nameQuery: {name: 'payload', method: 'TEXT_QUERY_METHOD_EQUALS'}}],
})
if (existing.result?.length) {
    console.error('project "payload" already exists, run `pnpm zitadel:down` to start from scratch')
    process.exit(1)
}

const {id: projectId} = await api<{id: string}>('POST', '/management/v1/projects', {
    name: 'payload',
    projectRoleAssertion: true,
})

await api('POST', `/management/v1/projects/${projectId}/roles/_bulk`, {
    roles: [
        {key: 'admin', displayName: 'Admin'},
        {key: 'editor', displayName: 'Editor'},
    ],
})

const callback = `${serverURL}/api/users/zitadel/callback`

const web = await api<{clientId: string}>('POST', `/management/v1/projects/${projectId}/apps/oidc`, {
    name: 'payload-admin',
    redirectUris: [callback],
    postLogoutRedirectUris: [callback],
    responseTypes: ['OIDC_RESPONSE_TYPE_CODE'],
    grantTypes: ['OIDC_GRANT_TYPE_AUTHORIZATION_CODE', 'OIDC_GRANT_TYPE_REFRESH_TOKEN'],
    appType: 'OIDC_APP_TYPE_WEB',
    authMethodType: 'OIDC_AUTH_METHOD_TYPE_NONE',
    accessTokenType: 'OIDC_TOKEN_TYPE_BEARER',
    idTokenRoleAssertion: true,
    idTokenUserinfoAssertion: true,
    devMode: true,
})

const introspection = await api<{clientId: string; clientSecret: string}>(
    'POST',
    `/management/v1/projects/${projectId}/apps/api`,
    {name: 'payload-api', authMethodType: 'API_AUTH_METHOD_TYPE_BASIC'},
)

const {userId} = await api<{userId: string}>('POST', '/v2/users/human', {
    username: testUser.username,
    profile: {givenName: 'Test', familyName: 'User'},
    email: {email: testUser.email, isVerified: true},
    password: {password: testUser.password, changeRequired: false},
})

await api('POST', `/management/v1/users/${userId}/grants`, {projectId, roleKeys: ['admin']})

// second API app authenticating with a JSON key (private_key_jwt), only used by the tests
const jwtApp = await api<{appId: string; clientId: string}>('POST', `/management/v1/projects/${projectId}/apps/api`, {
    name: 'payload-api-jwt',
    authMethodType: 'API_AUTH_METHOD_TYPE_PRIVATE_KEY_JWT',
})
const {keyDetails} = await api<{keyDetails: string}>(
    'POST',
    `/management/v1/projects/${projectId}/apps/${jwtApp.appId}/keys`,
    {type: 'KEY_TYPE_JSON', expirationDate: '2519-04-01T08:45:00Z'},
)

// machine user, the tests issue personal access tokens for it to stand in for API clients sending bearer tokens
const {userId: machineId} = await api<{userId: string}>('POST', '/management/v1/users/machine', {
    userName: 'api-client',
    name: 'API Client',
    accessTokenType: 'ACCESS_TOKEN_TYPE_BEARER',
})
await api('POST', `/management/v1/users/${machineId}/grants`, {projectId, roleKeys: ['editor']})

const values: Record<string, string> = {
    ZITADEL_ISSUER: issuer,
    ZITADEL_CLIENT_ID: web.clientId,
    ZITADEL_API_CLIENT_ID: introspection.clientId,
    ZITADEL_API_CLIENT_SECRET: introspection.clientSecret,
    ZITADEL_TEST_USERNAME: testUser.username,
    ZITADEL_TEST_PASSWORD: testUser.password,
    ZITADEL_TEST_API_KEY: Buffer.from(keyDetails, 'base64').toString('utf8'),
    ZITADEL_TEST_MACHINE_ID: machineId,
}

const template = readFileSync(existsSync(envFile) ? envFile : `${envFile}.example`, 'utf8')
const lines = template.split('\n').filter(line => !Object.keys(values).some(key => line.startsWith(`${key}=`)))
writeFileSync(
    envFile,
    [...lines.filter(Boolean), ...Object.entries(values).map(([key, value]) => `${key}=${value}`), ''].join('\n'),
)

console.log(`Zitadel provisioned, credentials written to ${envFile}`)
console.log(`test user: ${testUser.username} / ${testUser.password}`)
