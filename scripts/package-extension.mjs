import { readFile, readdir, mkdir, writeFile, lstat } from 'node:fs/promises'
import { resolve, relative, dirname, extname } from 'node:path'
import { zipSync } from 'fflate'

const [sourceArg, outputArg] = process.argv.slice(2)
if (!sourceArg || !outputArg) throw new Error('使い方: npm run extensions:pack -- <拡張ディレクトリ> <出力.shakyo-ext>')
const root = resolve(sourceArg)
const output = resolve(outputArg)
const files = Object.create(null)
async function collect(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name)
    if ((await lstat(path)).isSymbolicLink()) throw new Error('シンボリックリンクは同梱できません。')
    if (entry.isDirectory()) await collect(path)
    else {
      if (!['.js', '.json', '.txt', '.md'].includes(extname(path))) throw new Error(`未対応のファイル: ${relative(root, path)}`)
      files[relative(root, path).replaceAll('\\', '/')] = new Uint8Array(await readFile(path))
    }
  }
}
await collect(root)
if (!files['extension.json']) throw new Error('extension.jsonが必要です。')
await mkdir(dirname(output), { recursive: true })
await writeFile(output, zipSync(files), { flag: 'wx' })
console.log(`パッケージを作成しました: ${output}\n導入前の検査はshakyo上で実行されます。`)
