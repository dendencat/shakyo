import type { ExtensionManifest } from './api'
import { httpsUrl, record, safeKey, safePath } from './model'

function exact(value: Record<string, unknown>, keys: string[]) {
  if (Object.keys(value).some(key => !keys.includes(key))) throw new Error('未対応の宣言項目があります。')
}
export function parseManifest(value: unknown): ExtensionManifest {
  if (!record(value)) throw new Error('マニフェストがオブジェクトではありません。')
  exact(value, ['manifestVersion', 'apiVersion', 'id', 'name', 'version', 'entry', 'activation', 'permissions', 'contributes'])
  if (value.manifestVersion !== 1 || value.apiVersion !== 1) throw new Error('未対応のAPIまたはマニフェストです。')
  if (typeof value.id !== 'string' || !/^[a-z0-9][a-z0-9-]*\.[a-z0-9][a-z0-9-]*$/.test(value.id) || value.id.length > 100
    || typeof value.name !== 'string' || !value.name.trim() || value.name.length > 100
    || typeof value.version !== 'string' || !/^\d+\.\d+\.\d+$/.test(value.version)
    || typeof value.entry !== 'string' || !safePath(value.entry) || !value.entry.endsWith('.js')) {
    throw new Error('拡張ID・名前・バージョン・エントリを確認してください。')
  }
  if (value.activation !== undefined && !['command', 'startup'].includes(String(value.activation))) throw new Error('未対応の起動方法です。')
  const p = value.permissions
  if (!record(p)) throw new Error('権限の宣言が必要です。')
  exact(p, ['editor', 'reference', 'network'])
  for (const kind of ['editor', 'reference']) {
    const list = p[kind]
    if (!Array.isArray(list) || list.length > 2 || new Set(list).size !== list.length || list.some(v => !['read', 'write'].includes(v))) {
      throw new Error('未対応の権限があります。')
    }
  }
  if (!Array.isArray(p.network) || p.network.length > 20 || p.network.some(origin => {
    if (typeof origin !== 'string') return true
    try { return httpsUrl(origin).origin !== origin } catch { return true }
  })) throw new Error('通信先はHTTPSのorigin単位で指定してください。')
  const c = value.contributes
  if (!record(c)) throw new Error('機能の宣言が必要です。')
  exact(c, ['commands', 'settings'])
  if (!Array.isArray(c.commands) || c.commands.length > 30) throw new Error('コマンド宣言が正しくありません。')
  const ids = new Set<string>()
  for (const cmd of c.commands) {
    if (!record(cmd)) throw new Error('コマンド宣言が正しくありません。')
    exact(cmd, ['id', 'title'])
    if (typeof cmd.id !== 'string' || !safeKey(cmd.id) || !cmd.id.startsWith(`${value.id}.`) || ids.has(cmd.id)
      || typeof cmd.title !== 'string' || !cmd.title.trim() || cmd.title.length > 100) throw new Error('コマンドID・名前が正しくありません。')
    ids.add(cmd.id)
  }
  if (!record(c.settings) || Object.keys(c.settings).length > 30) throw new Error('設定の宣言が正しくありません。')
  for (const [key, setting] of Object.entries(c.settings)) {
    if (!safeKey(key) || !record(setting)) throw new Error('設定の宣言が正しくありません。')
    exact(setting, ['title', 'type', 'default', 'enum'])
    if (typeof setting.title !== 'string' || setting.title.length > 100 || !['string', 'number', 'boolean'].includes(String(setting.type))
      || typeof setting.default !== setting.type || (typeof setting.default === 'number' && !Number.isFinite(setting.default))
      || (typeof setting.default === 'string' && setting.default.length > 2000)) throw new Error('設定の型と初期値が一致しません。')
    if (setting.enum !== undefined && (setting.type !== 'string' || !Array.isArray(setting.enum) || setting.enum.length > 30
      || setting.enum.some(v => typeof v !== 'string' || v.length > 2000) || !setting.enum.includes(setting.default))) {
      throw new Error('設定の選択肢が正しくありません。')
    }
  }
  return value as unknown as ExtensionManifest
}
