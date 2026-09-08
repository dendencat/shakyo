import type { ReferenceSnapshot } from './api'

export interface ReferencePort {
  getCurrent(): ReferenceSnapshot
  openText(input: { name: string; text: string; language?: string }): void
  openUrl(url: string): void
}
