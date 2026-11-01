import { expect, it } from 'vitest'
import { pageTurnFromWheel } from './readerNavigation'

it('turns only when scrolling beyond the top or bottom boundary', () => {
  expect(pageTurnFromWheel(-1, { scrollTop: 0, clientHeight: 100, scrollHeight: 300 }, true, true)).toBe(-1)
  expect(pageTurnFromWheel(1, { scrollTop: 200, clientHeight: 100, scrollHeight: 300 }, true, true)).toBe(1)
  expect(pageTurnFromWheel(1, { scrollTop: 100, clientHeight: 100, scrollHeight: 300 }, true, true)).toBe(0)
  expect(pageTurnFromWheel(-1, { scrollTop: 0, clientHeight: 100, scrollHeight: 300 }, false, true)).toBe(0)
  expect(pageTurnFromWheel(1, { scrollTop: 0, clientHeight: 100, scrollHeight: 100 }, true, false)).toBe(0)
})
