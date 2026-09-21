import { isTauri } from './openExternal'

export async function applyAlwaysOnTop(enabled: boolean): Promise<void> {
  if (!isTauri()) return
  const { getCurrentWindow } = await import('@tauri-apps/api/window')
  await getCurrentWindow().setAlwaysOnTop(enabled)
}
