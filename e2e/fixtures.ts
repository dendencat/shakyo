import { zipSync, strToU8 } from 'fflate'

export function samplePdf(): Buffer {
  const stream = (text: string) => {
    const content = `BT /F1 20 Tf 40 300 Td (${text}) Tj ET`
    return `<< /Length ${content.length} >>\nstream\n${content}\nendstream`
  }
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R /Outlines 8 0 R >>',
    '<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 400] /Resources << /Font << /F1 7 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 400] /Resources << /Font << /F1 7 0 R >> >> /Contents 6 0 R >>',
    stream('First page'),
    stream('Second page'),
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    '<< /Type /Outlines /First 9 0 R /Last 10 0 R /Count 2 >>',
    '<< /Title (First) /Parent 8 0 R /Next 10 0 R /Dest [3 0 R /Fit] >>',
    '<< /Title (Second) /Parent 8 0 R /Prev 9 0 R /Dest [4 0 R /Fit] >>',
  ]
  let pdf = '%PDF-1.4\n'
  const offsets = [0]
  for (const [index, object] of objects.entries()) {
    offsets.push(Buffer.byteLength(pdf))
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`
  }
  const xref = Buffer.byteLength(pdf)
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  for (const offset of offsets.slice(1)) pdf += `${String(offset).padStart(10, '0')} 00000 n \n`
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  return Buffer.from(pdf)
}

export function sampleEpub(): Buffer {
  const files: Record<string, Uint8Array> = {
    mimetype: strToU8('application/epub+zip'),
    'META-INF/container.xml': strToU8('<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>'),
    'OEBPS/content.opf': strToU8('<?xml version="1.0"?><package version="2.0" xmlns="http://www.idpf.org/2007/opf" unique-identifier="BookId"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="BookId">smoke-book</dc:identifier><dc:title>Smoke EPUB</dc:title><dc:language>ja</dc:language></metadata><manifest><item id="ch1" href="ch1.xhtml" media-type="application/xhtml+xml"/><item id="ch2" href="ch2.xhtml" media-type="application/xhtml+xml"/><item id="toc" href="toc.ncx" media-type="application/x-dtbncx+xml"/></manifest><spine toc="toc"><itemref idref="ch1"/><itemref idref="ch2"/></spine></package>'),
    'OEBPS/toc.ncx': strToU8('<?xml version="1.0"?><ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1"><head><meta name="dtb:uid" content="smoke-book"/></head><docTitle><text>Smoke EPUB</text></docTitle><navMap><navPoint id="n1" playOrder="1"><navLabel><text>第一章</text></navLabel><content src="ch1.xhtml"/></navPoint><navPoint id="n2" playOrder="2"><navLabel><text>第二章</text></navLabel><content src="ch2.xhtml"/></navPoint></navMap></ncx>'),
    'OEBPS/ch1.xhtml': strToU8('<?xml version="1.0"?><html xmlns="http://www.w3.org/1999/xhtml"><head><title>第一章</title></head><body><h1>第一章</h1><p>EPUB smoke text</p><a href="ch2.xhtml">次の章</a></body></html>'),
    'OEBPS/ch2.xhtml': strToU8('<?xml version="1.0"?><html xmlns="http://www.w3.org/1999/xhtml"><head><title>第二章</title></head><body><h1>第二章</h1><p>EPUB second text</p></body></html>'),
  }
  return Buffer.from(zipSync(files))
}
