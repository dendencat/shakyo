import { strToU8, zipSync } from 'fflate'
import { describe, expect, it, vi } from 'vitest'
import {
  MAX_EPUB_REFERENCE_BYTES,
  MAX_TEXT_REFERENCE_BYTES,
  assertSafeEpubFile,
  hasFixedLayoutMetadata,
  inspectEpubArchive,
  isAllowedReferenceFileName,
  readReferenceFile,
  readTextReferenceFile,
} from './referenceFile'

const toArrayBuffer = (bytes: Uint8Array): ArrayBuffer => bytes.buffer.slice(
  bytes.byteOffset,
  bytes.byteOffset + bytes.byteLength,
) as ArrayBuffer

function epub(overrides: Record<string, Uint8Array> = {}): ArrayBuffer {
  return toArrayBuffer(zipSync({
    mimetype: [strToU8('application/epub+zip'), { level: 0 }],
    'META-INF/container.xml': strToU8(
      '<?xml version="1.0"?><container><rootfiles><rootfile full-path="OEBPS/content.opf"/></rootfiles></container>',
    ),
    'OEBPS/content.opf': strToU8(
      '<?xml version="1.0"?><package><metadata/><manifest/><spine/></package>',
    ),
    'OEBPS/chapter.xhtml': strToU8('<html><head/><body><p>本文</p></body></html>'),
    ...overrides,
  }))
}

describe('readTextReferenceFile', () => {
  it('500,000 bytes以下のファイルはtextを読み込む', async () => {
    const text = vi.fn().mockResolvedValue('console.log(1)')

    await expect(readTextReferenceFile({ size: MAX_TEXT_REFERENCE_BYTES, text })).resolves.toBe('console.log(1)')
    expect(text).toHaveBeenCalledOnce()
  })

  it('500,001 bytesのファイルはtextを呼ばず日本語エラーにする', async () => {
    const text = vi.fn().mockResolvedValue('too large')

    await expect(readTextReferenceFile({ size: MAX_TEXT_REFERENCE_BYTES + 1, text })).rejects.toThrow(
      'テキストファイルが大きすぎます。500 KB以下のファイルを選択してください。',
    )
    expect(text).not.toHaveBeenCalled()
  })

  it('textの失敗を伝播する', async () => {
    const error = new Error('decode failed')
    const text = vi.fn().mockRejectedValue(error)

    await expect(readTextReferenceFile({ size: MAX_TEXT_REFERENCE_BYTES, text })).rejects.toBe(error)
  })
})

describe('reference file allowlist', () => {
  it('accepts supported source/document extensions and specified extensionless names case-insensitively', () => {
    expect(isAllowedReferenceFileName('Component.TSX')).toBe(true)
    expect(isAllowedReferenceFileName('book.EPUB')).toBe(true)
    expect(isAllowedReferenceFileName('CMakeLists.txt')).toBe(true)
    expect(isAllowedReferenceFileName('Dockerfile')).toBe(true)
  })

  it('rejects unknown, executable, and arbitrary extensionless files', () => {
    expect(isAllowedReferenceFileName('photo.png')).toBe(false)
    expect(isAllowedReferenceFileName('payload.exe')).toBe(false)
    expect(isAllowedReferenceFileName('README')).toBe(false)
  })

  it('rejects a disallowed file before reading it', async () => {
    const text = vi.fn()
    const arrayBuffer = vi.fn()
    await expect(readReferenceFile({ name: 'payload.exe', size: 1, text, arrayBuffer })).rejects.toThrow('この形式')
    expect(text).not.toHaveBeenCalled()
    expect(arrayBuffer).not.toHaveBeenCalled()
  })

  it('validates PDF magic and the 100 MiB limit', async () => {
    const validPdf = new TextEncoder().encode('%PDF-1.7\n')
    await expect(readReferenceFile({
      name: 'sample.pdf', size: validPdf.byteLength, text: vi.fn(), arrayBuffer: async () => toArrayBuffer(validPdf),
    })).resolves.toMatchObject({ kind: 'pdf' })
    await expect(readReferenceFile({
      name: 'fake.pdf', size: 4, text: vi.fn(), arrayBuffer: async () => new ArrayBuffer(4),
    })).rejects.toThrow('正しいPDF')
    const arrayBuffer = vi.fn()
    await expect(readReferenceFile({
      name: 'large.epub', size: MAX_EPUB_REFERENCE_BYTES + 1, text: vi.fn(), arrayBuffer,
    })).rejects.toThrow('50 MiB')
    expect(arrayBuffer).not.toHaveBeenCalled()
  })
})

describe('EPUB validation', () => {
  it('detects fixed-layout metadata with XML parsing', () => {
    expect(hasFixedLayoutMetadata('<package><metadata><meta property="rendition:layout">pre-paginated</meta></metadata></package>')).toBe(true)
  })
  it('accepts a minimal safe reflowable EPUB and lists its entries', async () => {
    const data = epub()
    await expect(assertSafeEpubFile(data)).resolves.toBeUndefined()
    expect(inspectEpubArchive(data).map(entry => entry.name)).toContain('OEBPS/chapter.xhtml')
  })

  it('rejects a ZIP that is not an EPUB and a malformed ZIP', async () => {
    await expect(assertSafeEpubFile(toArrayBuffer(zipSync({ 'file.txt': strToU8('x') })))).rejects.toThrow('mimetype')
    await expect(assertSafeEpubFile(new ArrayBuffer(12))).rejects.toThrow('正しいEPUB')
  })

  it('rejects encryption metadata and fixed-layout publications independent of attribute order', async () => {
    await expect(assertSafeEpubFile(epub({
      'META-INF/encryption.xml': strToU8('<encryption/>'),
    }))).rejects.toThrow('暗号化')
    await expect(assertSafeEpubFile(epub({
      'OEBPS/content.opf': strToU8('<package><metadata><meta property="rendition:layout">pre-paginated</meta></metadata></package>'),
    }))).rejects.toThrow('固定レイアウト')
    await expect(assertSafeEpubFile(epub({
      'OEBPS/content.opf': strToU8('<package><metadata><meta content="true" name="fixed-layout"></metadata></package>'),
    }))).rejects.toThrow('固定レイアウト')
    await expect(assertSafeEpubFile(epub({
      'OEBPS/content.opf': strToU8(`<package><metadata><meta data-padding="${'x'.repeat(300)}" content="true" name="fixed&#45;layout"/></metadata></package>`),
    }))).rejects.toThrow('固定レイアウト')
    await expect(assertSafeEpubFile(epub({
      'OEBPS/content.opf': strToU8('<package><metadata><meta property="rendition&#58;layout">pre-paginated</meta></metadata></package>'),
    }))).rejects.toThrow('固定レイアウト')
    await expect(assertSafeEpubFile(epub({
      'META-INF/com.apple.ibooks.display-options.xml': strToU8('<display_options><platform name="*"><option name="fixed-layout">true</option></platform></display_options>'),
    }))).rejects.toThrow('固定レイアウト')
  })

  it('rejects path traversal, duplicate archive names, and external resource loads', async () => {
    await expect(assertSafeEpubFile(epub({ '../escape.xhtml': strToU8('<p/>') }))).rejects.toThrow('安全でない')
    await expect(assertSafeEpubFile(epub({
      'OEBPS/chapter.xhtml': strToU8('<html><body><img src="https://tracker.example/pixel"></body></html>'),
    }))).rejects.toThrow('外部通信')
    await expect(assertSafeEpubFile(epub({
      'OEBPS/chapter.xhtml': strToU8('<html><body><img src="&#x68;ttps://tracker.example/pixel"></body></html>'),
    }))).rejects.toThrow('外部通信')

    const data = new Uint8Array(epub({ 'OEBPS/chapter.opf': strToU8('<package/>') }))
    // 同じ長さの中央ディレクトリ名を書き換えて、content.opfを重複させる。
    const needle = strToU8('OEBPS/chapter.opf')
    const replacement = strToU8('OEBPS/content.opf')
    for (let offset = 0; offset <= data.length - needle.length; offset++) {
      if (data.subarray(offset, offset + needle.length).every((value, index) => value === needle[index])
        && offset >= 46 && new DataView(data.buffer).getUint32(offset - 46, true) === 0x02014b50) {
        data.set(replacement, offset)
        break
      }
    }
    expect(() => inspectEpubArchive(toArrayBuffer(data))).toThrow('重複')
  })
})
