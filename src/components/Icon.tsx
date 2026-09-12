import type { ButtonHTMLAttributes } from 'react'

export type IconName = 'files' | 'extensions' | 'settings' | 'help' | 'sun' | 'moon' | 'system' | 'layout' | 'close' | 'back' | 'forward' | 'reload' | 'go' | 'bookmark'
const paths: Record<IconName, React.ReactNode> = {
  files: <><path d="M14 2H6v16h14V8zM14 2v6h6M3 6v16h13" /></>,
  extensions: <><path d="M3 3h7v7H3zM3 14h7v7H3zM14 14h7v7h-7zM17 1l5 5-5 5-5-5z" /></>,
  settings: <><path d="m9 3 1-2h4l1 2 3 2 2-.2 2 3-1 2v4l1 2-2 3-2-.2-3 2-1 2h-4l-1-2-3-2-2 .2-2-3 1-2v-4l-1-2 2-3 2 .2z" /><circle cx="12" cy="12" r="3" /></>,
  help: <><circle cx="12" cy="12" r="9" /><path d="M9 9a3 3 0 1 1 4 3c-1 .5-1 1-1 2M12 17h.01" /></>,
  sun: <><circle cx="12" cy="12" r="4" /><path d="M12 1v2M12 21v2M1 12h2M21 12h2M4 4l2 2M18 18l2 2M4 20l2-2M18 6l2-2" /></>,
  moon: <path d="M20 15A9 9 0 0 1 9 4a9 9 0 1 0 11 11Z" />,
  system: <><rect x="3" y="3" width="18" height="13" rx="1" /><path d="M12 16v5M8 21h8" /></>,
  layout: <><rect x="3" y="3" width="18" height="18" rx="1" /><path d="M11 3v18M11 12h10" /></>,
  close: <path d="m6 6 12 12M6 18 18 6" />,
  back: <path d="m14 5-7 7 7 7M7 12h14" />,
  forward: <path d="m10 5 7 7-7 7M17 12H3" />,
  reload: <><path d="M20 4v6h-6M20 10a8 8 0 1 0 0 6" /></>,
  go: <path d="M4 12h16m-7-7 7 7-7 7" />,
  bookmark: <path d="m12 3 3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1z" />,
}
export function Icon({ name }: { name: IconName }) {
  return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">{paths[name]}</svg>
}
export function IconButton({ icon, label, className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { icon: IconName; label: string }) {
  return <button type="button" {...props} className={`icon-button ${className}`} title={label} aria-label={label}><Icon name={icon} /></button>
}
