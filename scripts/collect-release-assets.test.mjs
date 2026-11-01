import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

test('collects versioned Linux installers after reading package version', () => {
  const version = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version
  const root = mkdtempSync(join(tmpdir(), 'shakyo-release-assets-'))
  const bundle = join(root, 'src-tauri', 'target', 'release', 'bundle')
  mkdirSync(join(bundle, 'deb'), { recursive: true })
  mkdirSync(join(bundle, 'appimage'), { recursive: true })
  writeFileSync(join(bundle, 'deb', `shakyo_${version}_amd64.deb`), 'deb')
  writeFileSync(join(bundle, 'appimage', `shakyo_${version}_amd64.AppImage`), 'appimage')
  const result = spawnSync(process.execPath, [fileURLToPath(new URL('./collect-release-assets.mjs', import.meta.url))], {
    cwd: root,
    env: { ...process.env, RELEASE_PLATFORM: 'linux' },
    encoding: 'utf8',
  })
  assert.equal(result.status, 0, result.stderr)
  assert.equal(readFileSync(join(root, 'release-assets', `linux-shakyo_${version}_amd64.deb`), 'utf8'), 'deb')
  assert.equal(readFileSync(join(root, 'release-assets', `linux-shakyo_${version}_amd64.AppImage`), 'utf8'), 'appimage')
})

test('collects versioned Windows MSI and requires it to exist', () => {
  const version = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version
  const root = mkdtempSync(join(tmpdir(), 'shakyo-release-assets-'))
  const bundle = join(root, 'src-tauri', 'target', 'x86_64-pc-windows-msvc', 'release', 'bundle', 'msi')
  mkdirSync(bundle, { recursive: true })
  const command = [fileURLToPath(new URL('./collect-release-assets.mjs', import.meta.url))]
  const options = { cwd: root, env: { ...process.env, RELEASE_PLATFORM: 'windows' }, encoding: 'utf8' }
  writeFileSync(join(bundle, 'shakyo_0.0.0_x64.msi'), 'old')
  const missing = spawnSync(process.execPath, command, options)
  assert.notEqual(missing.status, 0)
  assert.match(missing.stderr, /Missing windows \.msi installer/)

  writeFileSync(join(bundle, `shakyo_${version}_x64.msi`), 'msi')
  writeFileSync(join(bundle, `shakyo_${version}_x64.exe`), 'exe')
  const result = spawnSync(process.execPath, command, options)
  assert.equal(result.status, 0, result.stderr)
  assert.equal(readFileSync(join(root, 'release-assets', `windows-shakyo_${version}_x64.msi`), 'utf8'), 'msi')
  assert.equal(existsSync(join(root, 'release-assets', `windows-shakyo_${version}_x64.exe`)), false)
  assert.equal(existsSync(join(root, 'release-assets', 'windows-shakyo_0.0.0_x64.msi')), false)
})

test('collects only a versioned universal macOS DMG and requires it to exist', () => {
  const version = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version
  const root = mkdtempSync(join(tmpdir(), 'shakyo-release-assets-'))
  const target = join(root, 'src-tauri', 'target')
  const universal = join(target, 'universal-apple-darwin', 'release', 'bundle', 'dmg')
  const intel = join(target, 'x86_64-apple-darwin', 'release', 'bundle', 'dmg')
  mkdirSync(universal, { recursive: true })
  mkdirSync(intel, { recursive: true })
  const command = [fileURLToPath(new URL('./collect-release-assets.mjs', import.meta.url))]
  const options = { cwd: root, env: { ...process.env, RELEASE_PLATFORM: 'macos' }, encoding: 'utf8' }
  writeFileSync(join(universal, 'shakyo_0.0.0_universal.dmg'), 'old')
  writeFileSync(join(intel, `shakyo_${version}_x64.dmg`), 'intel')
  const missing = spawnSync(process.execPath, command, options)
  assert.notEqual(missing.status, 0)
  assert.match(missing.stderr, /Missing macos \.dmg installer/)

  writeFileSync(join(universal, `shakyo_${version}_universal.dmg`), 'universal')
  const result = spawnSync(process.execPath, command, options)
  assert.equal(result.status, 0, result.stderr)
  assert.equal(readFileSync(join(root, 'release-assets', `macos-shakyo_${version}_universal.dmg`), 'utf8'), 'universal')
  assert.equal(existsSync(join(root, 'release-assets', `macos-shakyo_${version}_x64.dmg`)), false)
  assert.equal(existsSync(join(root, 'release-assets', 'macos-shakyo_0.0.0_universal.dmg')), false)
})
