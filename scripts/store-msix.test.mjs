import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { runStoreMsix } from './store-msix.mjs'

function executable(path, machine = 0x8664) {
  const bytes = Buffer.alloc(128)
  bytes.write('MZ')
  bytes.writeUInt32LE(64, 0x3c)
  bytes.write('PE\0\0', 64)
  bytes.writeUInt16LE(machine, 68)
  writeFileSync(path, bytes)
}

test('stages and verifies a Windows 11 x64 Store package', () => {
  const root = mkdtempSync(join(tmpdir(), 'shakyo-msix-'))
  const exe = join(root, 'shakyo.exe')
  const stage = join(root, 'stage')
  executable(exe)
  runStoreMsix('prepare', 'v2.3.2', exe, stage)
  const xml = readFileSync(join(stage, 'AppxManifest.xml'), 'utf8')
  assert.match(xml, /Version="2\.3\.2\.0"/)
  assert.match(xml, /Name="dendencat\.shakyo"/)
  assert.match(xml, /MinVersion="10\.0\.22000\.0"/)
  runStoreMsix('verify', 'v2.3.2', exe, stage)
  assert.throws(() => runStoreMsix('verify', 'v2.3.3', exe, stage))
  writeFileSync(join(stage, 'AppxManifest.xml'), xml.replace('dendencat.shakyo', 'wrong.identity'))
  assert.throws(() => runStoreMsix('verify', 'v2.3.2', exe, stage))
  writeFileSync(join(stage, 'AppxManifest.xml'), xml)
  writeFileSync(join(stage, 'shakyo.exe'), Buffer.alloc(128))
  assert.throws(() => runStoreMsix('verify', 'v2.3.2', exe, stage))
})

test('rejects invalid versions and non-x64 executables', () => {
  const root = mkdtempSync(join(tmpdir(), 'shakyo-msix-'))
  const exe = join(root, 'shakyo.exe')
  executable(exe, 0x14c)
  assert.throws(() => runStoreMsix('prepare', 'v2.3.2', exe, join(root, 'stage')))
  executable(exe)
  assert.throws(() => runStoreMsix('prepare', 'v2.3.65536', exe, join(root, 'stage')))
  assert.throws(() => runStoreMsix('prepare', 'v2.3.2-extra', exe, join(root, 'stage')))
})
