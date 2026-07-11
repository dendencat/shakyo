import { isLangId, type LangId } from './langs'

export const KEY_PASTE_REFERENCE = 'shakyo.reference.paste'

const SAVE_ERROR_MESSAGE = '保存に失敗しました。ブラウザの保存領域が不足しています。'

export interface PasteReference {
  text: string
  lang: LangId
}

function isPasteReference(value: unknown): value is PasteReference {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Record<string, unknown>
  return typeof candidate.text === 'string' && isLangId(candidate.lang)
}

export function loadPasteReference(): PasteReference | null {
  try {
    const raw = localStorage.getItem(KEY_PASTE_REFERENCE)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    return isPasteReference(parsed) ? parsed : null
  } catch {
    return null
  }
}

export function savePasteReference(ref: PasteReference): void {
  try {
    localStorage.setItem(KEY_PASTE_REFERENCE, JSON.stringify(ref))
  } catch {
    throw new Error(SAVE_ERROR_MESSAGE)
  }
}

export function clearPasteReference(): void {
  localStorage.removeItem(KEY_PASTE_REFERENCE)
}
