import { readdir, readFile } from 'node:fs/promises'
import { parse } from 'acorn'
import { simple } from 'acorn-walk'

const directory = new URL('../dist/assets/', import.meta.url)
const workers = (await readdir(directory)).filter(name => /^runtime\.worker-.*\.js$/.test(name))
if (workers.length !== 1) throw new Error('拡張Workerの出力を一意に特定できません。')
const source = await readFile(new URL(workers[0], directory), 'utf8')
const ast = parse(source, { ecmaVersion: 'latest', sourceType: 'module' })
let imports = 0
simple(ast, {
  ImportDeclaration() { imports++ },
  ImportExpression() { imports++ },
  ExportAllDeclaration() { imports++ },
  ExportNamedDeclaration(node) { if (node.source) imports++ },
})
// WebKit can evaluate an entry again when a split helper imports that entry,
// overwriting self.onmessage and losing the initialized sandbox.
if (imports) throw new Error('拡張Workerは単一JSにまとめてください。分割チャンクの循環importはWebKitで起動処理を失わせます。')
console.log('Worker bundle check passed: standalone runtime entry')
