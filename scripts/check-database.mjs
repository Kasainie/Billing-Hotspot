import { Client } from 'pg'

const connectionString = process.env.DATABASE_URL

if (!connectionString) {
  console.error('DATABASE_URL is missing from .env.local')
  process.exit(1)
}

const endpoint = new URL(connectionString)
const endpointType = endpoint.hostname.endsWith('.pooler.supabase.com')
  ? endpoint.port === '6543' ? 'Supabase transaction pooler' : 'Supabase pooler'
  : endpoint.hostname.endsWith('.supabase.co') ? 'Supabase direct endpoint' : 'custom PostgreSQL endpoint'
const client = new Client({ connectionString })

try {
  await client.connect()
  const { rows } = await client.query(`
    select
      to_regclass('public.sites') as sites,
      to_regclass('public.customers') as customers,
      to_regclass('public.payments') as payments,
      to_regclass('public.packages') as packages
  `)
  const missingTables = Object.entries(rows[0])
    .filter(([, table]) => table === null)
    .map(([name]) => name)

  if (missingTables.length > 0) {
    console.error(`Connected, but these billing tables are missing: ${missingTables.join(', ')}`)
    process.exitCode = 1
  } else {
    console.log('Database connection succeeded; all billing tables are present.')
  }
} catch (error) {
  const code = error instanceof Error && 'code' in error ? error.code : undefined
  const message = error instanceof Error ? error.message.toLowerCase() : ''
  const reason = message.includes('password authentication')
    ? 'database authentication was rejected'
    : message.includes('certificate') || message.includes('ssl')
      ? 'TLS configuration failed'
      : code === 'ENOTFOUND'
        ? 'database hostname was not found'
        : code === 'ETIMEDOUT'
          ? 'connection timed out'
          : 'connection failed'

  console.error(`Database check failed: ${reason}${code ? ` (${String(code)})` : ''}; endpoint type: ${endpointType}`)
  process.exitCode = 1
} finally {
  await client.end().catch(() => undefined)
}