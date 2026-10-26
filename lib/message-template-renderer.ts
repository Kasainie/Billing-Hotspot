export type MessageVariables = Record<string, string | number | boolean | null | undefined>

export function renderMessageTemplate(template: string, variables: MessageVariables) {
  return template.replace(/\{\{\s*([A-Za-z][A-Za-z0-9]*)\s*\}\}/g, (_match, key: string) => {
    const value = variables[key]
    return value === null || value === undefined ? '' : String(value)
  }).trim()
}
