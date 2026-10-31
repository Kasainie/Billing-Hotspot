export function logDatabaseError(context: string, error: unknown) {
  let cause = error
  while (cause instanceof Error && cause.cause !== undefined) {
    cause = cause.cause
  }

  if (cause instanceof Error) {
    const code = 'code' in cause && typeof cause.code === 'string' ? cause.code : undefined
    console.error(context, {
      name: cause.name,
      message: cause.message,
      ...(code ? { code } : {}),
    })
    return
  }

  console.error(context, { message: String(cause) })
}
