import test from 'node:test'
import assert from 'node:assert/strict'
import { exposeRouterScriptSource, redactRouterScriptSecrets } from './router-script-source.mjs'

test('only the LKTech managed monitor script source is exposed', () => {
  assert.equal(exposeRouterScriptSource({
    name: 'customer-script',
    source: ':put "private"',
  }), null)
  assert.equal(exposeRouterScriptSource({
    name: 'lktech-monitor',
    source: ':put "monitor"',
  }), ':put "monitor"')
})

test('router monitor authentication token is redacted from displayed script source', () => {
  const source = ':local monitorToken "secret-token"\n:local monitorId "router-id"'
  assert.equal(redactRouterScriptSecrets(source), ':local monitorToken "[REDACTED]"\n:local monitorId "router-id"')
})
