import { langs } from '@uiw/codemirror-extensions-langs'
import type { Extension } from '@codemirror/state'

export type LangId = keyof typeof langs

export const LANGUAGE_OPTIONS: { id: LangId; label: string }[] = [
  { id: 'ts', label: 'TypeScript' },
  { id: 'tsx', label: 'TSX (React)' },
  { id: 'js', label: 'JavaScript' },
  { id: 'jsx', label: 'JSX (React)' },
  { id: 'py', label: 'Python' },
  { id: 'rs', label: 'Rust' },
  { id: 'go', label: 'Go' },
  { id: 'java', label: 'Java' },
  { id: 'kt', label: 'Kotlin' },
  { id: 'swift', label: 'Swift' },
  { id: 'c', label: 'C' },
  { id: 'cpp', label: 'C++' },
  { id: 'cs', label: 'C#' },
  { id: 'rb', label: 'Ruby' },
  { id: 'php', label: 'PHP' },
  { id: 'sql', label: 'SQL' },
  { id: 'html', label: 'HTML' },
  { id: 'css', label: 'CSS' },
  { id: 'json', label: 'JSON' },
  { id: 'yaml', label: 'YAML' },
  { id: 'md', label: 'Markdown' },
  { id: 'sh', label: 'Shell' },
]

export function languageExtension(id: LangId): Extension[] {
  const factory = langs[id]
  return factory ? [factory()] : []
}

const LANGUAGE_IDS = new Set<LangId>(LANGUAGE_OPTIONS.map(({ id }) => id))

export function isLangId(value: unknown): value is LangId {
  return typeof value === 'string' && LANGUAGE_IDS.has(value as LangId)
}

const EXTENSION_MAP: Record<string, LangId> = {
  ts: 'ts',
  mts: 'ts',
  cts: 'ts',
  tsx: 'tsx',
  js: 'js',
  mjs: 'js',
  cjs: 'js',
  jsx: 'jsx',
  py: 'py',
  rs: 'rs',
  go: 'go',
  java: 'java',
  kt: 'kt',
  kts: 'kt',
  swift: 'swift',
  c: 'c',
  h: 'c',
  cc: 'cpp',
  cpp: 'cpp',
  cxx: 'cpp',
  hpp: 'cpp',
  cs: 'cs',
  rb: 'rb',
  php: 'php',
  sql: 'sql',
  html: 'html',
  htm: 'html',
  css: 'css',
  json: 'json',
  yml: 'yaml',
  yaml: 'yaml',
  md: 'md',
  markdown: 'md',
  sh: 'sh',
  bash: 'sh',
  zsh: 'sh',
}

export function langIdFromFilename(name: string): LangId | null {
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  return EXTENSION_MAP[ext] ?? null
}
