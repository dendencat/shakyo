import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { test } from 'node:test'

test('collects versioned Linux installers after reading package version', () => {
  const version = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version
  const root = mkdtempSync(join(tmpdir(), 'shakyo-release-assets-'))
  const bundle = join(root, 'src-tauri', 'target', 'release', 'bundle')
  mkdirSync(join(bundle, 'deb'), { recursive: true })
  mkdirSync(join(bundle, 'appimage'), { recursive: true })
  writeFileSync(join(bundle, 'deb', `shakyo_${version}_amd64.deb`), 'deb')
  writeFileSync(join(bundle, 'appimage', `shakyo_${version}_amd64.AppImage`), 'appimage')
  const result = spawnSync(process.execPath, [new URL('./collect-release-assets.mjs', import.meta.url).pathname], {
    cwd: root,
    env: { ...process.env, RELEASE_PLATFORM: 'linux' },
    encoding: 'utf8',
  })
  assert.equal(result.status, 0, result.stderr)
  assert.equal(readFileSync(join(root, 'release-assets', `linux-shakyo_${version}_amd64.deb`), 'utf8'), 'deb')
  assert.equal(readFileSync(join(root, 'release-assets', `linux-shakyo_${version}_amd64.AppImage`), 'utf8'), 'appimage')
})
