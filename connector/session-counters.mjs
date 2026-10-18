export function byteCounter(value) {
  if (value === null || value === undefined || value === '') return null
  const raw = typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
    ? String(value)
    : typeof value === 'string' && /^\d+$/.test(value)
      ? value
      : null
  if (raw === null || BigInt(raw) > 9_223_372_036_854_775_807n) {
    throw new Error('RouterOS returned an invalid active-session byte counter.')
  }
  return raw
}

export function addPppoeInterfaceCounters(sessions, interfaces) {
  if (!Array.isArray(interfaces)) throw new Error('RouterOS returned invalid interface statistics.')

  const activeInterfaces = new Map()
  for (const item of interfaces) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue
    const name = typeof item.name === 'string' ? item.name : null
    if (name && (item.running === 'true' || item.running === true)) {
      activeInterfaces.set(name, item)
    }
  }

  return sessions.map((session) => {
    if (session.sessionType !== 'pppoe' ||
        (session.downloadBytes !== null && session.uploadBytes !== null)) return session

    const routerInterface = activeInterfaces.get(`<pppoe-${session.username}>`)
    if (!routerInterface) return session

    return {
      ...session,
      downloadBytes: session.downloadBytes ?? byteCounter(routerInterface['tx-byte']),
      uploadBytes: session.uploadBytes ?? byteCounter(routerInterface['rx-byte']),
    }
  })
}
