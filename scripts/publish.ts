/**
 * publishes the package for a GitHub release, run by the release workflow
 *
 * checks that the release tag matches the version and that prereleases on GitHub are prereleases on npm,
 * packs with pnpm (resolves `catalog:` and `publishConfig`) and stages the tarball with npm (trusted publishing),
 * the staged version goes live once a maintainer approves it with 2FA (`npm stage approve <id>`)
 *
 * env: RELEASE_TAG (e.g. v1.0.0-beta.0), RELEASE_PRERELEASE (true|false), DRY_RUN (optional)
 */
import {execFileSync} from 'node:child_process'
import {mkdtempSync, readdirSync, readFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import path from 'node:path'

const fail = (message: string): never => {
    console.error(message)
    process.exit(1)
}

const {name, version} = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
const {RELEASE_TAG: tag, RELEASE_PRERELEASE: prerelease, DRY_RUN: dryRun} = process.env

if (tag !== `v${version}`) {
    fail(`release tag "${tag}" does not match the package version, expected "v${version}"`)
}

// 1.0.0-beta.0 → beta, 1.0.0 → latest
const distTag = /^\d+\.\d+\.\d+-([a-z]+)/.exec(version)?.[1] ?? 'latest'

if ((distTag !== 'latest') !== (prerelease === 'true')) {
    fail(
        `${version} is ${distTag === 'latest' ? 'a stable version' : 'a prerelease'}, mark the GitHub release accordingly`,
    )
}

const directory = mkdtempSync(path.join(tmpdir(), 'publish-'))
execFileSync('pnpm', ['pack', '--pack-destination', directory], {stdio: 'inherit'})
const tarball = path.join(
    directory,
    readdirSync(directory).find(file => file.endsWith('.tgz'))!,
)

console.log(`staging ${name}@${version} with tag ${distTag}`)
execFileSync(
    'npm',
    [
        'stage',
        'publish',
        tarball,
        '--access',
        'public',
        '--tag',
        distTag,
        ...(dryRun ? ['--dry-run'] : ['--provenance']),
    ],
    {stdio: 'inherit'},
)
