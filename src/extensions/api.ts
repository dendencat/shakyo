/** Public v1 contract. Only copied JSON data crosses the extension boundary. */
export type Json = null | boolean | number | string | Json[] | { [key: string]: Json }
export interface Disposable { dispose(): void }
export interface SettingDefinition {
  title: string
  type: 'string' | 'number' | 'boolean'
  default: string | number | boolean
  enum?: string[]
}
export interface ExtensionManifest {
  manifestVersion: 1
  apiVersion: 1
  id: string
  name: string
  version: string
  entry: string
  activation?: 'command' | 'startup'
  permissions: {
    editor: ('read' | 'write')[]
    reference: ('read' | 'write')[]
    network: string[]
  }
  contributes: {
    commands: { id: string; title: string }[]
    settings: Record<string, SettingDefinition>
  }
}
export interface EditorSnapshot {
  text: string
  language: string
  revision: number
  selection: { from: number; to: number }
}
export interface TextEdit { from: number; to: number; insert: string }
export type ReferenceSnapshot =
  | { kind: 'text'; name: string; text: string; language: string | null }
  | { kind: 'pdf'; name: string }
  | { kind: 'web'; url: string }
  | null
export interface ExtensionContext {
  readonly extension: { id: string; name: string; version: string }
  readonly subscriptions: Disposable[]
  readonly commands: { register(id: string, handler: () => void | Promise<void>): Disposable }
  readonly editor: {
    getSnapshot(): Promise<EditorSnapshot>
    applyEdits(input: { expectedRevision: number; edits: TextEdit[] }): Promise<void>
    onDidChange(listener: (event: { revision: number }) => void): Disposable
  }
  readonly reference: {
    getCurrent(): Promise<ReferenceSnapshot>
    openText(input: { name: string; text: string; language?: string }): Promise<void>
    openUrl(url: string): Promise<boolean>
    onDidChange(listener: () => void): Disposable
  }
  readonly ui: {
    notify(message: string): Promise<void>
    confirm(message: string): Promise<boolean>
    input(message: string): Promise<string | null>
    select(message: string, options: string[]): Promise<string | null>
  }
  readonly settings: {
    get(key: string): Promise<Json>
    onDidChange(listener: () => void): Disposable
  }
  readonly storage: {
    get(key: string): Promise<Json>
    set(key: string, value: Json): Promise<void>
    delete(key: string): Promise<void>
  }
  readonly assets: { readText(path: string): Promise<string>; readJson(path: string): Promise<Json> }
  readonly network: {
    fetch(input: { url: string; method?: 'GET' | 'POST'; headers?: Record<string, string>; body?: string }):
      Promise<{ status: number; body: string }>
  }
}
export interface ExtensionModule {
  activate(context: ExtensionContext): void | Promise<void>
  deactivate?(): void | Promise<void>
}
