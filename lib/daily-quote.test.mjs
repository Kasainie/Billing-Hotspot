import assert from 'node:assert/strict'
import test from 'node:test'
import { getDailyQuote } from './daily-quote.ts'

test('daily quotes are distinct throughout the full rotation', () => {
  const firstDay = new Date('2026-01-01T00:00:00+03:00')
  const quotes = Array.from({ length: 1024 }, (_, index) => {
    const date = new Date(firstDay.getTime() + index * 24 * 60 * 60 * 1000)
    return getDailyQuote(date)
  })

  assert.equal(new Set(quotes).size, quotes.length)
  assert.notEqual(getDailyQuote(firstDay), getDailyQuote(new Date(firstDay.getTime() + 24 * 60 * 60 * 1000)))
})

test('the same Nairobi date gets the same quote regardless of time of day', () => {
  assert.equal(
    getDailyQuote(new Date('2026-10-31T00:01:00+03:00')),
    getDailyQuote(new Date('2026-10-31T23:59:00+03:00')),
  )
})
