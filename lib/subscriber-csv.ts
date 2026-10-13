export function parseCsv(text: string): string[][] {
  const input = text.replace(/^\uFEFF/, '')
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false

  for (let index = 0; index < input.length; index += 1) {
    const character = input[index]

    if (quoted) {
      if (character === '"' && input[index + 1] === '"') {
        field += '"'
        index += 1
      } else if (character === '"') {
        quoted = false
      } else {
        field += character
      }
      continue
    }

    if (character === '"' && field.length === 0) {
      quoted = true
    } else if (character === ',') {
      row.push(field)
      field = ''
    } else if (character === '\n' || character === '\r') {
      row.push(field)
      if (row.some((value) => value.trim())) rows.push(row)
      row = []
      field = ''
      if (character === '\r' && input[index + 1] === '\n') index += 1
    } else {
      field += character
    }
  }

  if (quoted) throw new Error('The CSV file contains an unclosed quoted field.')
  row.push(field)
  if (row.some((value) => value.trim())) rows.push(row)
  return rows
}

export function escapeCsvField(value: string) {
  const safeValue = /^[\s\u0000-\u001f]*[=+\-@]/.test(value) ? `'${value}` : value
  return `"${safeValue.replace(/"/g, '""')}"`
}
