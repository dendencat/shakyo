import { beforeEach, expect, it } from 'vitest'
import { listSnapshots, saveSnapshot } from './snapshots'

beforeEach(() => localStorage.clear())

it('overwrites a current snapshot without changing its identity', () => {
  const first = saveSnapshot('lesson', 'ts', 'const before = 1')
  const second = saveSnapshot('lesson', 'js', 'const after = 2', first.id)
  expect(second.id).toBe(first.id)
  expect(listSnapshots()).toEqual([second])
})

it('keeps save-as name uniqueness while replacing the older entry', () => {
  saveSnapshot('lesson', 'ts', 'old')
  const latest = saveSnapshot('lesson', 'ts', 'new')
  expect(listSnapshots()).toEqual([latest])
})
