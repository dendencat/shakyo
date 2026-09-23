import { cpSync, existsSync, mkdirSync, readdirSync } from 'node:fs'
import { basename, join, sep } from 'node:path'

const platform = process.env.RELEASE_PLATFORM
const version = JSON.parse(await import('../package.json', { with: { type: 'json' } })).version
const suffixes = {
  linux: ['.deb', '.AppImage'],
  windows: ['.msi', '.exe'],
  'macos-arm64': ['.dmg'],
  'macos-x64': ['.dmg'],
}[platform]

if (!suffixes) throw new Error('Unknown release platform')

const root = 'src-tauri/target'
const assets = []
function visit(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) visit(path)
    else if (path.includes(`${sep}release${sep}bundle${sep}`) &&
      entry.name.includes(version) && suffixes.some(suffix => entry.name.endsWith(suffix))) assets.push(path)
  }
}
if (!existsSync(root)) throw new Error('Tauri build output is missing')
visit(root)
for (const suffix of suffixes) {
  if (!assets.some(path => path.endsWith(suffix))) throw new Error(`Missing ${platform} ${suffix} installer`)
}
mkdirSync('release-assets', { recursive: true })
for (const asset of assets) cpSync(asset, join('release-assets', `${platform}-${basename(asset)}`))
