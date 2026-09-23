import { readFileSync } from 'node:fs'

const tag = process.argv[2]
if (!/^v\d+\.\d+\.\d+$/.test(tag ?? '')) {
  throw new Error('A vX.Y.Z release tag is required')
}

const version = tag.slice(1)
const pkg = JSON.parse(readFileSync('package.json', 'utf8'))
const lock = JSON.parse(readFileSync('package-lock.json', 'utf8'))
const cargo = readFileSync('src-tauri/Cargo.toml', 'utf8')
const cargoLock = readFileSync('src-tauri/Cargo.lock', 'utf8')
const cargoVersion = cargo.match(/^\[package\][\s\S]*?^version\s*=\s*"([^"]+)"/m)?.[1]
const cargoLockVersion = cargoLock.match(/^name = "shakyo"\nversion = "([^"]+)"/m)?.[1]

for (const [name, actual] of Object.entries({
  'package.json': pkg.version,
  'package-lock.json': lock.version,
  'package-lock.json root': lock.packages?.['']?.version,
  'src-tauri/Cargo.toml': cargoVersion,
  'src-tauri/Cargo.lock': cargoLockVersion,
})) {
  if (actual !== version) throw new Error(`${name}: expected ${version}, found ${actual ?? 'missing'}`)
}
