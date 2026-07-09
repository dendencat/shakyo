export type ThemePref = 'light' | 'dark' | 'system'

const KEY_THEME = 'shakyo.theme'

const THEME_PREFS: ThemePref[] = ['light', 'dark', 'system']

export function loadThemePref(): ThemePref {
  const saved = localStorage.getItem(KEY_THEME)
  return THEME_PREFS.includes(saved as ThemePref) ? (saved as ThemePref) : 'system'
}

export function saveThemePref(pref: ThemePref) {
  localStorage.setItem(KEY_THEME, pref)
}

export function resolveTheme(pref: ThemePref, systemPrefersDark: boolean): 'light' | 'dark' {
  if (pref === 'system') return systemPrefersDark ? 'dark' : 'light'
  return pref
}

export function nextThemePref(pref: ThemePref): ThemePref {
  return THEME_PREFS[(THEME_PREFS.indexOf(pref) + 1) % THEME_PREFS.length]
}
