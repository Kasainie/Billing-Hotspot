export type PasswordRequirementStatus = {
  id: 'length' | 'uppercase' | 'number' | 'symbol'
  label: string
  met: boolean
}

export function getPasswordRequirements(password: string): PasswordRequirementStatus[] {
  return [
    { id: 'length', label: 'At least 6 characters', met: password.length >= 6 },
    { id: 'uppercase', label: 'At least one capital letter', met: /\p{Lu}/u.test(password) },
    { id: 'number', label: 'At least one number', met: /\p{N}/u.test(password) },
    { id: 'symbol', label: 'At least one symbol', met: /[\p{P}\p{S}]/u.test(password) },
  ]
}

export function getPasswordValidationErrors(password: string): string[] {
  const errors = getPasswordRequirements(password)
    .filter((requirement) => !requirement.met)
    .map((requirement) => requirement.label)
  if (password.length > 128) errors.push('No more than 128 characters')
  return errors
}
