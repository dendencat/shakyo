import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { DOMParser } from '@xmldom/xmldom'

export function runStoreMsix(command, tag, executable, directory) {
  if (!['prepare', 'verify'].includes(command) || !tag || !executable || !directory) {
    throw new Error('Usage: node scripts/store-msix.mjs <prepare|verify> <vX.Y.Z> <shakyo.exe> <directory>')
  }

  const versionParts = /^v(\d+)\.(\d+)\.(\d+)$/.exec(tag)
  if (!versionParts || versionParts.slice(1).some((part, index) =>
    !Number.isSafeInteger(Number(part)) || Number(part) > 65535 || (index === 0 && Number(part) === 0))) {
    throw new Error('MSIX tag must be vX.Y.Z with parts 0..65535 and a nonzero major version')
  }
  const version = `${versionParts.slice(1).map(Number).join('.')}.0`
  const icons = ['StoreLogo.png', 'Square150x150Logo.png', 'Square44x44Logo.png']
  const iconSource = 'src-tauri/icons'
  const manifestSource = 'scripts/store-msix/AppxManifest.xml'

  function requireX64Pe(path) {
    const bytes = readFileSync(path)
    if (bytes.length < 0x40 || bytes.toString('ascii', 0, 2) !== 'MZ') throw new Error('Windows executable is not a PE file')
    const offset = bytes.readUInt32LE(0x3c)
    if (offset + 6 > bytes.length || bytes.toString('ascii', offset, offset + 4) !== 'PE\0\0' ||
        bytes.readUInt16LE(offset + 4) !== 0x8664) throw new Error('Windows executable is not x64 PE')
  }

  function digest(path) {
    return createHash('sha256').update(readFileSync(path)).digest('hex')
  }

  function manifestXml() {
    return readFileSync(manifestSource, 'utf8').replace('__VERSION__', version)
  }

  function parse(xml) {
    const errors = []
    const doc = new DOMParser({ errorHandler: { warning: error => errors.push(error), error: error => errors.push(error), fatalError: error => errors.push(error) } }).parseFromString(xml, 'application/xml')
    if (errors.length) throw new Error(`Invalid MSIX manifest: ${errors.join('; ')}`)
    return doc
  }

  function validateManifest(xml) {
    const actual = parse(xml)
    const expected = parse(manifestXml())
    for (const [namespace, element, attributes] of [
      ['http://schemas.microsoft.com/appx/manifest/foundation/windows10', 'Identity', ['Name', 'Publisher', 'Version', 'ProcessorArchitecture']],
      ['http://schemas.microsoft.com/appx/manifest/foundation/windows10', 'TargetDeviceFamily', ['Name', 'MinVersion', 'MaxVersionTested']],
      ['http://schemas.microsoft.com/appx/manifest/foundation/windows10', 'Application', ['Id', 'Executable']],
      ['http://schemas.microsoft.com/appx/manifest/uap/windows10', 'VisualElements', ['DisplayName', 'Square150x150Logo', 'Square44x44Logo']],
    ]) {
      const actualNodes = actual.getElementsByTagNameNS(namespace, element)
      const expectedNodes = expected.getElementsByTagNameNS(namespace, element)
      assert.equal(actualNodes.length, 1, `Missing or duplicate ${element}`)
      for (const attribute of attributes) {
        assert.equal(actualNodes.item(0).getAttribute(attribute), expectedNodes.item(0).getAttribute(attribute), `${element}.${attribute}`)
      }
    }
    for (const [namespace, element] of [
      ['http://schemas.microsoft.com/appx/manifest/foundation/windows10', 'DisplayName'],
      ['http://schemas.microsoft.com/appx/manifest/foundation/windows10', 'PublisherDisplayName'],
      ['http://schemas.microsoft.com/appx/manifest/foundation/windows10', 'Logo'],
      ['http://schemas.microsoft.com/appx/manifest/foundation/windows10/restrictedcapabilities', 'Capability'],
    ]) {
      const actualNodes = actual.getElementsByTagNameNS(namespace, element)
      const expectedNodes = expected.getElementsByTagNameNS(namespace, element)
      assert.equal(actualNodes.length, 1, `Missing or duplicate ${element}`)
      assert.equal(actualNodes.item(0).textContent || actualNodes.item(0).getAttribute('Name'),
        expectedNodes.item(0).textContent || expectedNodes.item(0).getAttribute('Name'), element)
    }
    const runtime = actual.getElementsByTagNameNS('http://schemas.microsoft.com/appx/manifest/foundation/windows10', 'Application').item(0)
    assert.equal(runtime.getAttributeNS('http://schemas.microsoft.com/appx/manifest/uap/windows10/10', 'RuntimeBehavior'), 'packagedClassicApp')
    assert.equal(runtime.getAttributeNS('http://schemas.microsoft.com/appx/manifest/uap/windows10/10', 'TrustLevel'), 'mediumIL')
  }

  requireX64Pe(executable)
  if (command === 'prepare') {
    if (existsSync(directory)) throw new Error('MSIX staging directory must not already exist')
    mkdirSync(join(directory, 'Assets'), { recursive: true })
    copyFileSync(executable, join(directory, 'shakyo.exe'))
    for (const icon of icons) copyFileSync(join(iconSource, icon), join(directory, 'Assets', icon))
    const xml = manifestXml()
    validateManifest(xml)
    writeFileSync(join(directory, 'AppxManifest.xml'), xml)
  } else {
    validateManifest(readFileSync(join(directory, 'AppxManifest.xml'), 'utf8'))
    assert.equal(digest(join(directory, 'shakyo.exe')), digest(executable), 'MSIX executable payload differs from build')
    for (const icon of icons) {
      assert.equal(digest(join(directory, 'Assets', icon)), digest(join(iconSource, icon)), `MSIX ${icon} differs from source`)
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runStoreMsix(...process.argv.slice(2))
}
