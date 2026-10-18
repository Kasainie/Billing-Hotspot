export type ReportExportFormat = 'csv' | 'excel' | 'pdf'

type ExportReportOptions = {
  format: ReportExportFormat
  fileName: string
  title: string
  headers: string[]
  rows: unknown[][]
  sheetName?: string
  pdfLayout?: {
    headers: string[]
    rows: unknown[][]
    columnWidths?: number[]
  }
}

export type SubscriberUsagePdfOptions = {
  fileName: string
  name: string
  email: string
  username: string | null
  phone: string | null
  connectionType: string
  accountNumber: string | null
  totalPaid: string
  paidThisMonth: string
  sessionsThisMonth: number
  averageSessionThisMonth: string
  online: boolean
  siteName: string | null
  currentSession: Array<[string, string]>
  last24Hours: Array<{ hour: string; download: string; upload: string; totalBytes: number }>
  thisMonth: Array<{ day: string; download: string; upload: string; totalBytes: number }>
  sessions: Array<[string, string, string, string, string, string]>
  payments: Array<[string, string, string, string]>
  generatedAt: string
}

function xmlEscape(value: string) {
  return value.replace(/[<>&"']/g, (character) => ({
    '<': '&lt;',
    '>': '&gt;',
    '&': '&amp;',
    '"': '&quot;',
    "'": '&apos;',
  })[character]!)
}

function columnName(number: number) {
  let name = ''
  for (let value = number; value > 0; value = Math.floor((value - 1) / 26)) {
    name = String.fromCharCode(65 + ((value - 1) % 26)) + name
  }
  return name
}

function csvCell(value: unknown) {
  const text = value === null || value === undefined ? '' : String(value)
  const safeText = /^[\s\u0000-\u001f]*[=+\-@]/.test(text) ? `'${text}` : text
  return `"${safeText.replace(/"/g, '""')}"`
}

function downloadCsv({ headers, rows, fileName }: ExportReportOptions) {
  const csv = `\uFEFF${[headers, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n')}`
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = `${fileName}.csv`
  document.body.append(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export async function exportTabularReport(options: ExportReportOptions) {
  if (options.format === 'csv') {
    downloadCsv(options)
    return
  }

  if (options.format === 'excel') {
    const { zipSync, strToU8 } = await import('fflate')
    const data = [options.headers, ...options.rows]
    const worksheetRows = data.map((row, rowIndex) => {
      const cells = row.map((value, columnIndex) => {
        const address = `${columnName(columnIndex + 1)}${rowIndex + 1}`
        if (typeof value === 'number' && Number.isFinite(value)) return `<c r="${address}" t="n"><v>${value}</v></c>`
        const text = value === null || value === undefined ? '' : String(value)
        return `<c r="${address}" t="inlineStr"><is><t xml:space="preserve">${xmlEscape(text)}</t></is></c>`
      }).join('')
      return `<row r="${rowIndex + 1}">${cells}</row>`
    }).join('')
    const sheetName = xmlEscape((options.sheetName || 'Report').slice(0, 31))
    const lastColumn = columnName(options.headers.length)
    const lastRow = Math.max(1, data.length)
    const workbookFiles = {
      '[Content_Types].xml': strToU8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>'),
      '_rels/.rels': strToU8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'),
      'xl/workbook.xml': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${sheetName}" sheetId="1" r:id="rId1"/></sheets></workbook>`),
      'xl/_rels/workbook.xml.rels': strToU8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>'),
      'xl/worksheets/sheet1.xml': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><sheetData>${worksheetRows}</sheetData><autoFilter ref="A1:${lastColumn}${lastRow}"/></worksheet>`),
    }
    const buffer = zipSync(workbookFiles)
    const url = URL.createObjectURL(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
    const link = document.createElement('a')
    link.href = url
    link.download = `${options.fileName}.xlsx`
    document.body.append(link)
    link.click()
    link.remove()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
    return
  }

  const [{ jsPDF }, autoTableModule] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
  ])
  const pdfDocument = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' })
  const autoTable = autoTableModule.default
  const pageWidth = pdfDocument.internal.pageSize.getWidth()
  const pageHeight = pdfDocument.internal.pageSize.getHeight()
  const sideMargin = 36
  const pdfHeaders = options.pdfLayout?.headers || options.headers
  const pdfRows = options.pdfLayout?.rows || options.rows
  const generatedAt = new Date().toLocaleString('en-KE', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Africa/Nairobi',
  })

  autoTable(pdfDocument, {
    head: [pdfHeaders],
    body: pdfRows.map((row) => row.map((value) => value === null || value === undefined ? '' : String(value))),
    theme: 'grid',
    startY: 94,
    showHead: 'everyPage',
    styles: {
      font: 'helvetica',
      fontSize: 7.5,
      cellPadding: { top: 5, right: 5, bottom: 5, left: 5 },
      overflow: 'linebreak',
      textColor: [51, 65, 85],
      lineColor: [226, 232, 240],
      lineWidth: 0.35,
      valign: 'middle',
    },
    headStyles: {
      fillColor: [15, 23, 42],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 7,
      cellPadding: { top: 7, right: 5, bottom: 7, left: 5 },
      lineColor: [15, 23, 42],
    },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: options.pdfLayout?.columnWidths
      ? Object.fromEntries(options.pdfLayout.columnWidths.map((cellWidth, index) => [index, { cellWidth }]))
      : undefined,
    margin: { top: 94, right: sideMargin, bottom: 36, left: sideMargin },
    didDrawPage: (data) => {
      pdfDocument.setFillColor(37, 99, 235)
      pdfDocument.roundedRect(sideMargin, 22, 28, 28, 6, 6, 'F')
      pdfDocument.setTextColor(255, 255, 255)
      pdfDocument.setFont('helvetica', 'bold')
      pdfDocument.setFontSize(14)
      pdfDocument.text('L', sideMargin + 14, 41, { align: 'center' })

      pdfDocument.setTextColor(37, 99, 235)
      pdfDocument.setFontSize(8)
      pdfDocument.text('LKTECH  /  ISP OPERATIONS', sideMargin + 38, 31)
      pdfDocument.setTextColor(15, 23, 42)
      pdfDocument.setFontSize(17)
      pdfDocument.text(pdfDocument.splitTextToSize(options.title, pageWidth - sideMargin * 2), sideMargin, 67)

      pdfDocument.setTextColor(100, 116, 139)
      pdfDocument.setFont('helvetica', 'normal')
      pdfDocument.setFontSize(8)
      pdfDocument.text(`${pdfRows.length.toLocaleString('en-KE')} records  |  Generated ${generatedAt}`, sideMargin, 83)

      pdfDocument.setDrawColor(226, 232, 240)
      pdfDocument.setLineWidth(0.6)
      pdfDocument.line(sideMargin, pageHeight - 26, pageWidth - sideMargin, pageHeight - 26)
      pdfDocument.setTextColor(100, 116, 139)
      pdfDocument.setFontSize(7.5)
      pdfDocument.text('Generated by LKTECH ISP Operations', sideMargin, pageHeight - 12)
      pdfDocument.text(`Page ${data.pageNumber}`, pageWidth - sideMargin, pageHeight - 12, { align: 'right' })
    },
  })
  pdfDocument.save(`${options.fileName}.pdf`)
}

export async function exportSubscriberUsagePdf(options: SubscriberUsagePdfOptions) {
  const [{ jsPDF }, autoTableModule] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
  ])
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' })
  const autoTable = autoTableModule.default
  const pageWidth = pdf.internal.pageSize.getWidth()
  const pageHeight = pdf.internal.pageSize.getHeight()
  const margin = 38
  const contentWidth = pageWidth - margin * 2
  const orange: [number, number, number] = [244, 130, 0]
  const ink: [number, number, number] = [17, 24, 39]
  const muted: [number, number, number] = [107, 114, 128]
  const line: [number, number, number] = [225, 228, 232]
  let cursorY = 0
  const tableFinalY = () =>
    (pdf as typeof pdf & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? cursorY

  const drawFooter = (pageNumber: number) => {
    pdf.setDrawColor(...line)
    pdf.setLineWidth(0.6)
    pdf.line(margin, pageHeight - 34, pageWidth - margin, pageHeight - 34)
    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(7.5)
    pdf.setTextColor(...muted)
    pdf.text(`Generated ${options.generatedAt} · Usage is based on router accounting updates.`, margin, pageHeight - 20)
    pdf.text(`Page ${pageNumber}`, pageWidth - margin, pageHeight - 20, { align: 'right' })
  }

  const drawHeader = () => {
    pdf.setFillColor(...orange)
    pdf.roundedRect(margin, 34, 36, 36, 8, 8, 'F')
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(14)
    pdf.setTextColor(255, 255, 255)
    const initials = options.name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || 'S'
    pdf.text(initials, margin + 18, 57, { align: 'center' })

    pdf.setTextColor(...ink)
    pdf.setFontSize(13)
    pdf.text(options.name, margin + 48, 49, { maxWidth: 210 })
    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(8)
    pdf.setTextColor(...muted)
    pdf.text(options.email || options.username || '', margin + 48, 63, { maxWidth: 210 })

    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(19)
    pdf.setTextColor(...ink)
    pdf.text('Usage report', pageWidth - margin, 49, { align: 'right' })
    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(9)
    pdf.setTextColor(...muted)
    pdf.text(options.siteName || options.name, pageWidth - margin, 66, { align: 'right', maxWidth: 220 })

    const statusLabel = options.online ? 'ONLINE' : 'OFFLINE'
    const statusWidth = pdf.getTextWidth(statusLabel) + 18
    pdf.setFillColor(255, 247, 237)
    pdf.roundedRect(pageWidth - margin - statusWidth, 77, statusWidth, 17, 8, 8, 'F')
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(7)
    pdf.setTextColor(...orange)
    pdf.text(statusLabel, pageWidth - margin - statusWidth / 2, 88, { align: 'center' })

    pdf.setDrawColor(...line)
    pdf.setLineWidth(0.7)
    pdf.line(margin, 108, pageWidth - margin, 108)
    cursorY = 127
  }

  const drawFacts = (title: string, entries: Array<[string, string]>, x: number, y: number, width: number) => {
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(9)
    pdf.setTextColor(...ink)
    pdf.text(title, x, y)
    let rowY = y + 18
    for (const [label, value] of entries) {
      const valueX = x + Math.min(100, width * 0.48)
      const labelLines = pdf.splitTextToSize(label, valueX - x - 8)
      const valueLines = pdf.splitTextToSize(value || '—', width - (valueX - x))
      pdf.setFont('helvetica', 'normal')
      pdf.setFontSize(8)
      pdf.setTextColor(...muted)
      pdf.text(labelLines, x, rowY)
      pdf.setFont('helvetica', 'bold')
      pdf.setTextColor(...ink)
      pdf.text(valueLines, valueX, rowY)
      rowY += Math.max(labelLines.length, valueLines.length) * 10 + 5
    }
    return rowY
  }

  const section = (title: string, description?: string, minimumHeight = 54) => {
    if (cursorY + minimumHeight > pageHeight - 42) {
      pdf.addPage()
      cursorY = 48
    }
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(11)
    pdf.setTextColor(...ink)
    pdf.text(title, margin, cursorY)
    cursorY += 15
    if (description) {
      pdf.setFont('helvetica', 'normal')
      pdf.setFontSize(8)
      pdf.setTextColor(...muted)
      pdf.text(description, margin, cursorY)
      cursorY += 12
    }
    return cursorY
  }

  const drawTrafficTable = (
    title: string,
    description: string,
    rows: Array<{ label: string; download: string; upload: string; totalBytes: number }>,
    maxBytes: number,
    firstColumnHeader: string,
  ) => {
    if (!rows.length) return
    section(title, description)
    autoTable(pdf, {
      startY: cursorY,
      head: [[firstColumnHeader, 'TRAFFIC', 'DOWNLOAD', 'UPLOAD']],
      body: rows.map((row) => [row.label, '', row.download, row.upload]),
      theme: 'plain',
      margin: { left: margin, right: margin, top: 42, bottom: 42 },
      tableWidth: contentWidth,
      rowPageBreak: 'avoid',
      styles: {
        font: 'helvetica',
        fontSize: 8,
        textColor: ink,
        cellPadding: { top: 5.5, right: 4, bottom: 5.5, left: 0 },
        lineColor: line,
        lineWidth: { bottom: 0.35 },
        valign: 'middle',
      },
      headStyles: {
        fontSize: 7,
        fontStyle: 'bold',
        textColor: muted,
        fillColor: [255, 255, 255],
        lineColor: ink,
        lineWidth: { bottom: 0.8 },
        cellPadding: { top: 4, right: 4, bottom: 6, left: 0 },
      },
      columnStyles: {
        0: { cellWidth: 78 },
        1: { cellWidth: 242 },
        2: { cellWidth: 91, halign: 'right' },
        3: { cellWidth: 91, halign: 'right' },
      },
      didDrawCell: (data) => {
        if (data.section !== 'body' || data.column.index !== 1) return
        const row = rows[data.row.index]
        if (!row) return
        const trackWidth = data.cell.width - 8
        const trackHeight = 5
        const barWidth = row.totalBytes > 0
          ? Math.max(2, trackWidth * Math.min(1, row.totalBytes / maxBytes))
          : 0
        pdf.setFillColor(244, 245, 247)
        pdf.roundedRect(data.cell.x + 2, data.cell.y + (data.cell.height - trackHeight) / 2, trackWidth, trackHeight, 2.5, 2.5, 'F')
        if (barWidth > 0) {
          pdf.setFillColor(...orange)
          pdf.roundedRect(data.cell.x + 2, data.cell.y + (data.cell.height - trackHeight) / 2, barWidth, trackHeight, 2.5, 2.5, 'F')
        }
      },
      didDrawPage: (data) => drawFooter(data.pageNumber),
    })
    cursorY = tableFinalY() + 24
  }

  drawHeader()
  const factsX = margin + contentWidth / 2 + 12
  const factsWidth = contentWidth / 2 - 12
  const factsLeftBottom = drawFacts('Subscriber', [
    ['Username', options.username || '—'],
    ['Account', options.accountNumber || '—'],
    ['Phone', options.phone || '—'],
    ['Type', options.connectionType],
  ], margin, cursorY, contentWidth / 2 - 18)
  const factsRightBottom = drawFacts('Account', [
    ['Total paid', options.totalPaid],
    ['Paid this month', options.paidThisMonth],
    ['Sessions this month', String(options.sessionsThisMonth)],
    ['Average session this month', options.averageSessionThisMonth],
  ], factsX, cursorY, factsWidth)
  cursorY = Math.max(factsLeftBottom, factsRightBottom) + 18

  cursorY = section('Current session')
  autoTable(pdf, {
    startY: cursorY,
    body: options.currentSession,
    theme: 'plain',
    margin: { left: margin, right: margin, top: 42, bottom: 42 },
    tableWidth: contentWidth,
    styles: {
      font: 'helvetica',
      fontSize: 8,
      cellPadding: { top: 4, right: 8, bottom: 4, left: 0 },
      textColor: ink,
      lineWidth: 0,
    },
    columnStyles: {
      0: { cellWidth: 82, textColor: muted },
      1: { cellWidth: contentWidth - 82, fontStyle: 'bold' },
    },
  })
  cursorY = tableFinalY() + 18

  const max24h = Math.max(...options.last24Hours.map((row) => row.totalBytes), 1)
  drawTrafficTable(
    'Last 24 hours',
    `${formatTrafficTotal(options.last24Hours)} · hours with traffic, oldest first`,
    options.last24Hours.map((row) => ({
      label: row.hour,
      download: row.download,
      upload: row.upload,
      totalBytes: row.totalBytes,
    })),
    max24h,
    'HOUR',
  )

  const maxMonth = Math.max(...options.thisMonth.map((row) => row.totalBytes), 1)
  drawTrafficTable(
    'This month',
    `${formatTrafficTotal(options.thisMonth)} · days with traffic`,
    options.thisMonth.map((row) => ({
      label: row.day,
      download: row.download,
      upload: row.upload,
      totalBytes: row.totalBytes,
    })),
    maxMonth,
    'DAY',
  )

  if (options.sessions.length) {
    section('Recent sessions', undefined, Math.min(420, 48 + Math.min(options.sessions.length, 20) * 16))
    autoTable(pdf, {
      startY: cursorY,
      head: [['STARTED', 'ROUTER', 'DURATION', 'DOWNLOAD', 'UPLOAD', 'ENDED']],
      body: options.sessions,
      theme: 'plain',
      margin: { left: margin, right: margin, top: 42, bottom: 42 },
      tableWidth: contentWidth,
      rowPageBreak: 'avoid',
      styles: {
        font: 'helvetica',
        fontSize: 7,
        textColor: ink,
        cellPadding: { top: 5, right: 3, bottom: 5, left: 0 },
        lineColor: line,
        lineWidth: { bottom: 0.35 },
        overflow: 'linebreak',
      },
      headStyles: { fontSize: 6.5, fontStyle: 'bold', textColor: muted, fillColor: [255, 255, 255], lineColor: ink, lineWidth: { bottom: 0.8 } },
      columnStyles: { 0: { cellWidth: 82 }, 1: { cellWidth: 105 }, 2: { cellWidth: 60 }, 3: { cellWidth: 76, halign: 'right' }, 4: { cellWidth: 68, halign: 'right' }, 5: { cellWidth: 111 } },
      didDrawPage: (data) => drawFooter(data.pageNumber),
    })
    cursorY = tableFinalY() + 20
  }

  section('Recent payments', undefined, Math.min(360, 48 + Math.min(options.payments.length, 16) * 16))
  if (options.payments.length) {
    autoTable(pdf, {
      startY: cursorY,
      head: [['DATE', 'METHOD', 'REFERENCE', 'AMOUNT']],
      body: options.payments,
      theme: 'plain',
      margin: { left: margin, right: margin, top: 42, bottom: 42 },
      tableWidth: contentWidth,
      rowPageBreak: 'avoid',
      styles: { font: 'helvetica', fontSize: 7.5, textColor: ink, cellPadding: { top: 5, right: 4, bottom: 5, left: 0 }, lineColor: line, lineWidth: { bottom: 0.35 }, overflow: 'linebreak' },
      headStyles: { fontSize: 7, fontStyle: 'bold', textColor: muted, fillColor: [255, 255, 255], lineColor: ink, lineWidth: { bottom: 0.8 } },
      columnStyles: { 0: { cellWidth: 105 }, 1: { cellWidth: 120 }, 2: { cellWidth: 190 }, 3: { cellWidth: 87, halign: 'right' } },
      didDrawPage: (data) => drawFooter(data.pageNumber),
    })
  } else {
    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(8)
    pdf.setTextColor(...muted)
    pdf.text('No payments recorded.', margin, cursorY + 4)
  }

  const pageCount = pdf.getNumberOfPages()
  for (let page = 1; page <= pageCount; page += 1) {
    pdf.setPage(page)
    drawFooter(page)
  }
  pdf.save(`${options.fileName}.pdf`)
}

function formatTrafficTotal(rows: Array<{ download: string; upload: string }>) {
  const download = rows.reduce((sum, row) => sum + parseFormattedBytes(row.download), 0)
  const upload = rows.reduce((sum, row) => sum + parseFormattedBytes(row.upload), 0)
  return `${formatReportBytes(download)} down · ${formatReportBytes(upload)} up`
}

function parseFormattedBytes(value: string) {
  const match = value.match(/^([\d,.]+)\s*(B|KB|MB|GB|TB)$/i)
  if (!match) return 0
  const amount = Number(match[1].replace(/,/g, ''))
  const exponent = ['B', 'KB', 'MB', 'GB', 'TB'].indexOf(match[2].toUpperCase())
  return amount * 1024 ** Math.max(0, exponent)
}

function formatReportBytes(value: number) {
  if (!Number.isFinite(value) || value <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const exponent = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1)
  return `${(value / 1024 ** exponent).toLocaleString('en-KE', { maximumFractionDigits: 1 })} ${units[exponent]}`
}
