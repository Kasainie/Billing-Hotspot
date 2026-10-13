import test from 'node:test'
import assert from 'node:assert/strict'
import {
  automaticBackupName,
  automaticBackupsToDelete,
  automaticBackupTimestamp,
  routerFileTimestamp,
} from './backup-policy.mjs'

test('automatic backup names encode a UTC timestamp and parse it accurately', () => {
  const date = new Date('2026-10-12T11:47:48.000Z')
  const name = automaticBackupName(date)
  assert.equal(name, 'lktech-auto-20261012-114748')
  assert.equal(automaticBackupTimestamp(`${name}.backup`), date.getTime())
  assert.equal(automaticBackupTimestamp('lktech-auto-20260230-114748.backup'), null)
  assert.equal(automaticBackupTimestamp('router-backup.backup'), null)
})

test('retention removes only automatic backups beyond the newest thirty', () => {
  const files = Array.from({ length: 32 }, (_, index) => {
    const timestamp = new Date(Date.UTC(2026, 0, 1 + index))
    return {
      name: `${automaticBackupName(timestamp)}.backup`,
      '.id': `*${index + 1}`,
    }
  })
  files.push({ name: 'manual.backup', '.id': '*manual' })
  const deletionList = automaticBackupsToDelete(files)
  assert.deepEqual(deletionList.map((file) => file['.id']), ['*2', '*1'])
})

test('RouterOS file timestamps can order backups with the newest first', () => {
  assert.equal(routerFileTimestamp({
    name: 'legacy.backup',
    'creation-time': 'oct/12/2026 14:47:48',
  }), Date.UTC(2026, 9, 12, 14, 47, 48))
  assert.equal(routerFileTimestamp({
    name: 'lktech-auto-20261012-114748.backup',
    'creation-time': 'oct/11/2026 14:47:48',
  }), Date.UTC(2026, 9, 12, 11, 47, 48))
})
