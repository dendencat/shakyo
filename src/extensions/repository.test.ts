// @vitest-environment node
import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { repository } from './repository'
import type { InstalledExtension } from './model'

describe('IndexedDB atomic storage', () => {
  it('serializes concurrent updates and rolls back rejected mutations', async () => {
    const item = { instanceId: crypto.randomUUID(), enabled: true, report: { packageHash: 'same' }, data: {}, settings: {} } as unknown as InstalledExtension
    await repository.replace(item)
    try {
      await Promise.all([
        repository.modify(item.instanceId, 'same', row => { row.data.a = 1 }),
        repository.modify(item.instanceId, 'same', row => { row.data.b = 2 }),
      ])
      expect((await repository.get(item.instanceId))!.data).toEqual({ a: 1, b: 2 })
      await expect(repository.modify(item.instanceId, 'same', row => { row.data.a = 3; throw new Error('rollback') })).rejects.toThrow('rollback')
      expect((await repository.get(item.instanceId))!.data.a).toBe(1)
      await expect(repository.modify(item.instanceId, 'different', () => {})).rejects.toThrow()
      await repository.replace({ ...item, enabled: false })
      await expect(repository.modify(item.instanceId, 'same', () => {})).rejects.toThrow()
    } finally { await repository.remove(item.instanceId) }
  })
})
