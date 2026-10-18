import assert from 'node:assert/strict'
import test from 'node:test'
import { addPppoeInterfaceCounters, byteCounter } from './session-counters.mjs'

test('dynamic PPPoE interface counters map TX to download and RX to upload', () => {
  const sessions = [{
    sessionType: 'pppoe',
    username: 'customer-1',
    downloadBytes: null,
    uploadBytes: null,
  }]

  assert.deepEqual(addPppoeInterfaceCounters(sessions, [{
    name: '<pppoe-customer-1>',
    running: 'true',
    'rx-byte': '123',
    'tx-byte': '9007199254740993',
  }]), [{
    ...sessions[0],
    downloadBytes: '9007199254740993',
    uploadBytes: '123',
  }])
})

test('interface fallback preserves existing counters and ignores inactive or unrelated interfaces', () => {
  const sessions = [
    { sessionType: 'pppoe', username: 'customer-1', downloadBytes: '50', uploadBytes: null },
    { sessionType: 'pppoe', username: 'customer-2', downloadBytes: null, uploadBytes: null },
    { sessionType: 'hotspot', username: 'customer-1', downloadBytes: null, uploadBytes: null },
  ]

  assert.deepEqual(addPppoeInterfaceCounters(sessions, [
    { name: '<pppoe-customer-1>', running: 'true', 'rx-byte': '7', 'tx-byte': '8' },
    { name: '<pppoe-customer-2>', running: 'false', 'rx-byte': '9', 'tx-byte': '10' },
    { name: '<pppoe-other>', running: 'true', 'rx-byte': '11', 'tx-byte': '12' },
  ]), [
    { ...sessions[0], uploadBytes: '7' },
    sessions[1],
    sessions[2],
  ])
})

test('invalid interface counters are rejected', () => {
  assert.throws(() => byteCounter('-1'), /invalid active-session byte counter/)
  assert.throws(() => addPppoeInterfaceCounters([{
    sessionType: 'pppoe',
    username: 'customer-1',
    downloadBytes: null,
    uploadBytes: null,
  }], [{
    name: '<pppoe-customer-1>',
    running: true,
    'rx-byte': '1',
    'tx-byte': '9223372036854775808',
  }]), /invalid active-session byte counter/)
})
