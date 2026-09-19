import { useEffect, useRef, useState } from 'react'
import type { ThemePref } from '../lib/theme'
import { IconButton } from './Icon'

export function ThemeMenu({ value, resolved, onChange, onOpenChange }: {
  value: ThemePref; resolved: 'light' | 'dark'; onChange: (value: ThemePref) => void; onOpenChange: (open: boolean) => void
}) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const changeOpen = (next: boolean) => { setOpen(next); onOpenChange(next) }
  useEffect(() => {
    if (!open) return
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) { setOpen(false); onOpenChange(false) }
    }
    document.addEventListener('pointerdown', outside)
    return () => document.removeEventListener('pointerdown', outside)
  }, [open, onOpenChange])
  return <div className="theme-menu" ref={root} onBlur={event => {
    if (!event.currentTarget.contains(event.relatedTarget)) changeOpen(false)
  }} onKeyDown={event => {
    if (event.key === 'Escape' && !event.nativeEvent.isComposing) {
      event.stopPropagation(); changeOpen(false); root.current?.querySelector('button')?.focus()
    }
  }}>
    <IconButton icon={resolved === 'light' ? 'sun' : 'moon'} label={`テーマ: ${{ light: 'ライト', dark: 'ダーク', system: 'システム' }[value]}`} aria-expanded={open} aria-controls="theme-options" onClick={() => changeOpen(!open)} />
    {open && <div className="theme-popover" id="theme-options" role="group" aria-label="テーマ">
      {(['light', 'dark', 'system'] as const).map(pref => <IconButton key={pref} icon={pref === 'light' ? 'sun' : pref === 'dark' ? 'moon' : 'system'} label={`テーマ: ${{ light: 'ライト', dark: 'ダーク', system: 'システム' }[pref]}`} aria-pressed={value === pref} onClick={() => {
        onChange(pref); changeOpen(false); root.current?.querySelector('button')?.focus()
      }} />)}
    </div>}
  </div>
}
