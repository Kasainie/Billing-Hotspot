export function getProvisioningDbErrorMessage(error: unknown) {
  if (error instanceof Error) {
    const message = error.message.toLowerCase()

    if (message.includes('router_provisioning_tokens') || message.includes('relation') && message.includes('router_provisioning_tokens')) {
      return 'Router provisioning database is not initialized. Apply the Supabase migration for router_provisioning_tokens before creating a new script.'
    }

    if (message.includes('connect') || message.includes('password') || message.includes('database')) {
      return 'Database connection failed while creating the provisioning link.'
    }

    return `Provisioning setup failed: ${error.message}`
  }

  return 'Unable to create a temporary router script link'
}
