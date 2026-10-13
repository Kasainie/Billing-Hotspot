export function redactRouterScriptSecrets(source) {
  if (typeof source !== 'string') return null
  return source.replace(
    /(:local\s+monitorToken\s+)(?:"[^"]*"|'[^']*'|[^\s;]+)/gi,
    '$1"[REDACTED]"',
  )
}

export function exposeRouterScriptSource(script) {
  if (!script || script.name !== 'lktech-monitor') return null
  return redactRouterScriptSecrets(script.source)
}
