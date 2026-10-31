const actions = [
  'listen closely and respond with care',
  'keep promises, even in small moments',
  'learn from every challenge',
  'make time for thoughtful improvements',
  'share knowledge generously',
  'measure progress honestly',
  'choose clarity over complexity',
  'make dependable service a daily habit',
  'put people before process',
  'turn good ideas into useful action',
  'ask better questions',
  'make room for different perspectives',
  'finish the work we start',
  'treat every detail with care',
  'keep learning as we grow',
  'make the next step easier',
  'use setbacks as a reason to improve',
  'stay curious about what is possible',
  'work together toward lasting solutions',
  'make useful information easy to find',
  'focus on what matters most',
  'give thoughtful work the time it needs',
  'be generous with credit and support',
  'build systems people can count on',
  'welcome feedback and act on it',
  'solve today’s problems with tomorrow in mind',
  'choose steady progress over shortcuts',
  'make technology feel more human',
  'take responsibility for the outcome',
  'notice small wins along the way',
  'leave every process better than we found it',
  'keep showing up with purpose',
]

const outcomes = [
  'reliability',
  'respect',
  'room to grow',
  'access to opportunity',
  'confidence to explore',
  'service that works when it matters',
  'a little more peace of mind',
  'a fair chance to succeed',
  'a simpler path forward',
  'the freedom to stay connected',
  'care in every interaction',
  'a team ready to help',
  'the clarity to make good decisions',
  'a network people can trust',
  'time for what matters',
  'a reason to keep moving forward',
  'the support to try something new',
  'a better experience every day',
  'connections that open doors',
  'progress everyone can share',
  'ideas that make a difference',
  'a service people feel good about',
  'a strong start and a steady future',
  'the confidence that help is nearby',
  'technology that brings people closer',
  'work that makes life easier',
  'the chance to build something lasting',
  'a community that moves forward',
  'solutions made for real people',
  'a connection worth counting on',
  'the trust earned through consistency',
  'a brighter possibility for tomorrow',
]

const millisecondsPerDay = 24 * 60 * 60 * 1000
const quoteEpoch = Date.UTC(2026, 0, 1)

export function getDailyQuote(date = new Date()) {
  const dateParts = new Intl.DateTimeFormat('en-KE', {
    timeZone: 'Africa/Nairobi',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)
  const parts = Object.fromEntries(dateParts.map(({ type, value }) => [type, value]))
  const year = Number(parts.year)
  const month = Number(parts.month)
  const day = Number(parts.day)
  const dayIndex = Math.floor((Date.UTC(year, month - 1, day) - quoteEpoch) / millisecondsPerDay)
  const quoteIndex = ((dayIndex % (actions.length * outcomes.length)) + actions.length * outcomes.length) % (actions.length * outcomes.length)
  const action = actions[quoteIndex % actions.length]
  const outcome = outcomes[Math.floor(quoteIndex / actions.length)]

  return `Great service grows when we ${action}, and every connection deserves ${outcome}.`
}
