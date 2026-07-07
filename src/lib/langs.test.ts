import { describe, expect, it } from 'vitest'
import { langIdFromFilename } from './langs'

describe('langIdFromFilename', () => {
  it('known extensions を正しい言語IDに解決する', () => {
    expect(langIdFromFilename('main.ts')).toBe('ts')
    expect(langIdFromFilename('component.tsx')).toBe('tsx')
    expect(langIdFromFilename('index.js')).toBe('js')
    expect(langIdFromFilename('app.jsx')).toBe('jsx')
    expect(langIdFromFilename('script.py')).toBe('py')
    expect(langIdFromFilename('main.rs')).toBe('rs')
    expect(langIdFromFilename('main.go')).toBe('go')
    expect(langIdFromFilename('Main.java')).toBe('java')
    expect(langIdFromFilename('style.css')).toBe('css')
    expect(langIdFromFilename('data.json')).toBe('json')
    expect(langIdFromFilename('config.yml')).toBe('yaml')
    expect(langIdFromFilename('config.yaml')).toBe('yaml')
    expect(langIdFromFilename('README.md')).toBe('md')
    expect(langIdFromFilename('README.markdown')).toBe('md')
    expect(langIdFromFilename('run.sh')).toBe('sh')
    expect(langIdFromFilename('run.bash')).toBe('sh')
    expect(langIdFromFilename('run.zsh')).toBe('sh')
  })

  it('エイリアス拡張子を正規のlangIdへ集約する', () => {
    expect(langIdFromFilename('module.mts')).toBe('ts')
    expect(langIdFromFilename('module.cts')).toBe('ts')
    expect(langIdFromFilename('module.mjs')).toBe('js')
    expect(langIdFromFilename('module.cjs')).toBe('js')
    expect(langIdFromFilename('header.h')).toBe('c')
    expect(langIdFromFilename('impl.cc')).toBe('cpp')
    expect(langIdFromFilename('impl.cxx')).toBe('cpp')
    expect(langIdFromFilename('header.hpp')).toBe('cpp')
    expect(langIdFromFilename('page.htm')).toBe('html')
  })

  it('未知の拡張子には null を返す', () => {
    expect(langIdFromFilename('archive.zip')).toBeNull()
    expect(langIdFromFilename('image.png')).toBeNull()
    expect(langIdFromFilename('notes.txt')).toBeNull()
  })

  it('大文字拡張子も小文字化して解決する', () => {
    expect(langIdFromFilename('MAIN.TS')).toBe('ts')
    expect(langIdFromFilename('Script.PY')).toBe('py')
  })

  it('拡張子がないファイル名には null を返す', () => {
    expect(langIdFromFilename('Makefile')).toBeNull()
    expect(langIdFromFilename('')).toBeNull()
  })

  it('複数のドットを含むファイル名は最後の拡張子で判定する', () => {
    expect(langIdFromFilename('archive.tar.gz')).toBeNull()
    expect(langIdFromFilename('my.component.tsx')).toBe('tsx')
  })

  it('末尾がドットのみの場合は null を返す', () => {
    expect(langIdFromFilename('noext.')).toBeNull()
  })
})
