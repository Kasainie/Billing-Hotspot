import assert from 'node:assert/strict'
import test from 'node:test'
import { messageTemplateDefaults, messageTemplateDefinitions } from './message-templates.ts'
import { renderMessageTemplate } from './message-template-renderer.ts'

test('each template default contains only documented tokens', () => {
  for (const template of messageTemplateDefinitions) {
    assert.equal(messageTemplateDefaults[template.id], template.defaultMessage)
    assert.equal(messageTemplateDefaults[template.enabledKey], template.defaultEnabled)
    const tokens = [...template.defaultMessage.matchAll(/\{\{([A-Za-z][A-Za-z0-9]*)\}\}/g)].map((match) => match[1])
    assert.deepEqual(tokens.filter((token) => !template.tokens.includes(token)), [])
    assert.ok(template.tokens.includes('supportContact'))
    assert.ok(tokens.includes('supportContact'))
  }
})

test('template rendering replaces values and removes unavailable placeholders', () => {
  assert.equal(
    renderMessageTemplate('Hello {{ name }}, receipt {{reference}} {{expiry}}', {
      name: 'Amina',
      reference: 12345,
      expiry: null,
    }),
    'Hello Amina, receipt 12345',
  )
})

test('template rendering omits unavailable placeholder values instead of sending tokens', () => {
  assert.equal(renderMessageTemplate('Hello {{unknown}}', {}), 'Hello')
})
