/**
 * prepares a release: applies the pending changesets (version and CHANGELOG) and commits the result
 *
 * publishing happens afterwards by creating a GitHub release for the printed tag, see .github/workflows/release.yml
 */
import {execFileSync} from 'node:child_process'
import {readFileSync} from 'node:fs'

const run = (command: string, ...args: string[]) => execFileSync(command, args, {stdio: 'inherit'})

const readVersion = () =>
    JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version as string

if (execFileSync('git', ['status', '--porcelain'], {encoding: 'utf8'}).trim()) {
    console.error('working tree is not clean, commit or stash first')
    process.exit(1)
}

const before = readVersion()
run('pnpm', 'changeset', 'version')
const version = readVersion()

if (version === before) {
    console.error('no pending changesets, add one with `pnpm changeset` first')
    process.exit(1)
}

run('pnpm', 'install', '--lockfile-only')
run('pnpm', 'format')
run('git', 'add', '-A')
run('git', 'commit', '-m', `chore: release v${version}`)

console.log(`
prepared v${version}, next:
  1. git push
  2. create a GitHub release with tag v${version} on main${version.includes('-') ? ', marked as pre-release' : ''}
     the release workflow publishes it to npm`)
