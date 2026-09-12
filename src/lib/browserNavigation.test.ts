import { expect, it } from 'vitest'
import { emptyNavigation, visit, step, normalizeBrowserUrl } from './browserNavigation'
it('goes back/forward and drops forward entries after a new visit', () => {
  const ab = visit(visit(emptyNavigation, 'https://a.test'), 'https://b.test')
  const back = step(ab, -1)
  expect(back.entries[back.index]).toBe('https://a.test')
  expect(step(back, 1)).toEqual(ab)
  const ac = visit(back, 'https://c.test')
  expect(ac.entries).toEqual(['https://a.test', 'https://c.test'])
  expect(visit(ac, 'https://c.test')).toBe(ac)
})
it('normalizes input and refuses non-web schemes and credentials', () => {
  expect(normalizeBrowserUrl(' example.com ')).toBe('https://example.com/')
  for (const url of ['javascript:alert(1)', 'file:///etc/passwd', 'https://user:secret@example.com', 'https://']) expect(() => normalizeBrowserUrl(url)).toThrow()
})
