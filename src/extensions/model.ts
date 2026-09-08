import type { ExtensionManifest, Json } from './api'

export const SCANNER_VERSION = '1'
export const POLICY_VERSION = '1'
export const LIMITS = {
  archive: 5 * 1024 * 1024, expanded: 10 * 1024 * 1024, file: 2 * 1024 * 1024,
  files: 100, storage: 1024 * 1024, message: 2 * 1024 * 1024,
  cpuMs: 1000, commandMs: 30_000, scanMs: 15_000, networkMs: 10_000,
} as const
export interface Finding {
  rule: string
  severity: 'block' | 'warning'
  message: string
  file?: string
  line?: number
  column?: number
}
export interface PreflightReport {
  packageHash: string
  scannerVersion: string
  policyVersion: string
  findings: Finding[]
  outcome: 'blocked' | 'review-required' | 'no-findings'
}
export interface CheckedPackage {
  manifest: ExtensionManifest | null
  files: Record<string, string>
  report: PreflightReport
}
export interface InstalledExtension {
  instanceId: string
  archive: Uint8Array
  manifest: ExtensionManifest
  report: PreflightReport
  enabled: boolean
  data: Record<string, Json>
  settings: Record<string, Json>
}
export function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
export function safeKey(key: string): boolean {
  return /^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$/.test(key)
    && !['__proto__', 'prototype', 'constructor'].includes(key)
}
export function safePath(path: string): boolean {
  return path.length <= 200 && /^[a-zA-Z0-9_./-]+$/.test(path)
    && path.split('/').every(part => part !== '' && part !== '.' && part !== '..' && safeKey(part))
}
export function httpsUrl(raw: string): URL {
  const url = new URL(raw)
  const host = url.hostname.toLowerCase().replace(/\.$/, '')
  if (url.protocol !== 'https:' || url.username || url.password || !host
    || host === 'localhost' || host.endsWith('.localhost') || host.startsWith('127.')
    || host === '0.0.0.0' || host.includes(':') || /^10\./.test(host)
    || /^192\.168\./.test(host) || /^169\.254\./.test(host)
    || /^172\.(1[6-9]|2\d|3[01])\./.test(host)) {
    throw new Error('公開されたHTTPS URLを指定してください。')
  }
  return url
}
export function jsonCopy(value: unknown, limit: number = LIMITS.message): Json {
  const text = JSON.stringify(value)
  if (text === undefined || new TextEncoder().encode(text).length > limit) throw new Error('データの上限を超えています。')
  return JSON.parse(text) as Json
}
