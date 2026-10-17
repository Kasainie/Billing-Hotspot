export function canManageTenant(role: string) {
  return role === 'owner' || role === 'admin'
}
