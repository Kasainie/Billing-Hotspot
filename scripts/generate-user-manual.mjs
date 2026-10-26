import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { jsPDF } from 'jspdf'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const sourcePath = path.join(root, 'docs', 'user-manual.md')
const outputPath = path.join(root, 'docs', 'LKTECH-User-Manual.pdf')
const markdown = fs.readFileSync(sourcePath, 'utf8')
const pdf = new jsPDF({ unit: 'pt', format: 'a4', compress: true })
const pageWidth = pdf.internal.pageSize.getWidth()
const pageHeight = pdf.internal.pageSize.getHeight()
const left = 54
const right = pageWidth - 54
const contentWidth = right - left
const footerStartPage = 2
const headings = []
let y = 62
let inCodeBlock = false
let coverPage = true
let skippingSourceContents = false

const colors = {
  navy: [16, 37, 67],
  blue: [30, 91, 170],
  pale: [239, 245, 252],
  ink: [38, 48, 61],
  muted: [96, 110, 126],
  line: [219, 227, 236],
  white: [255, 255, 255],
}

function setTextColor(color) {
  pdf.setTextColor(...color)
}

function ensureSpace(height) {
  if (y + height <= pageHeight - 56) return
  pdf.addPage()
  coverPage = false
  y = 62
}

function cleanInline(value) {
  return value
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/\u2192/g, ' to ')
    .replace(/\u2190/g, ' <- ')
    .replace(/\u2022/g, '-')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1 - $2')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/~~([^~]+)~~/g, '$1')
}

function startCover() {
  pdf.setFillColor(...colors.navy)
  pdf.rect(0, 0, pageWidth, pageHeight, 'F')
  pdf.setFillColor(...colors.blue)
  pdf.rect(0, 0, 12, pageHeight, 'F')
  pdf.setFillColor(39, 117, 199)
  pdf.roundedRect(54, 78, 116, 30, 7, 7, 'F')
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(12)
  setTextColor(colors.white)
  pdf.text('LKTECH', 69, 98)
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(10)
  pdf.text('HOTSPOT BILLING | FIELD GUIDE', 180, 98)

  pdf.setFillColor(26, 55, 91)
  pdf.roundedRect(54, 190, pageWidth - 108, 250, 14, 14, 'F')
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(31)
  pdf.text('User and', 78, 265)
  pdf.text('Operator Manual', 78, 306)
  pdf.setFillColor(71, 151, 226)
  pdf.roundedRect(78, 332, 58, 5, 2, 2, 'F')
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(13)
  pdf.setTextColor(219, 230, 244)
  pdf.text('A practical guide for ISP owners, workspace', 78, 377)
  pdf.text('administrators, and support staff', 78, 398)

  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(10)
  pdf.setTextColor(160, 190, 222)
  pdf.text('OPERATIONS  /  NETWORK  /  BILLING  /  SUPPORT', 56, pageHeight - 102)
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(10)
  pdf.setTextColor(202, 216, 232)
  const editionDate = new Intl.DateTimeFormat('en', { month: 'long', year: 'numeric' }).format(new Date())
  pdf.text(`Edition 1 | ${editionDate}`, 56, pageHeight - 78)
  pdf.text('https://billing.lktech.life', 56, pageHeight - 59)
  pdf.addPage()
  pdf.addPage()
  coverPage = false
  y = 62
}

function addRunningHeader(pageNumber) {
  if (pageNumber < footerStartPage) return
  pdf.setDrawColor(...colors.line)
  pdf.setLineWidth(0.6)
  pdf.line(left, 42, right, 42)
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(8)
  setTextColor(colors.blue)
  pdf.text('LKTECH  /  USER AND OPERATOR MANUAL', left, 32)
}

function renderContents() {
  pdf.setPage(2)
  y = 78
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(22)
  setTextColor(colors.navy)
  pdf.text('Contents', left, y)
  y += 30
  pdf.setDrawColor(...colors.blue)
  pdf.setLineWidth(2)
  pdf.line(left, y, left + 48, y)
  y += 27
  const entries = headings.filter((item) => item.level === 2 && item.title !== 'Contents')
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(10)
  for (const item of entries) {
    if (y > pageHeight - 68) break
    setTextColor(colors.ink)
    const title = cleanInline(item.title)
    const pageNumber = item.page - 1
    pdf.text(title, left, y)
    pdf.setDrawColor(...colors.line)
    pdf.setLineDashPattern([1, 2], 0)
    const titleWidth = pdf.getTextWidth(title)
    pdf.line(left + titleWidth + 8, y - 2, right - 25, y - 2)
    pdf.setLineDashPattern([], 0)
    setTextColor(colors.muted)
    pdf.text(String(pageNumber), right, y, { align: 'right' })
    pdf.link(left, y - 12, contentWidth, 16, { pageNumber: item.page, top: item.top })
    y += 20
  }
}

function writeParagraph(text, options = {}) {
  const fontSize = options.fontSize ?? 10
  const lineHeight = options.lineHeight ?? fontSize * 1.48
  const indent = options.indent ?? 0
  const width = contentWidth - indent - (options.rightIndent ?? 0)
  pdf.setFont(options.font ?? 'helvetica', options.style ?? 'normal')
  pdf.setFontSize(fontSize)
  setTextColor(options.color ?? colors.ink)
  const lines = pdf.splitTextToSize(cleanInline(text), width)
  for (const line of lines) {
    ensureSpace(lineHeight)
    pdf.text(line, left + indent, y)
    y += lineHeight
  }
  y += options.after ?? 5
}

function renderCodeLine(text) {
  const fontSize = 8.2
  pdf.setFont('courier', 'normal')
  pdf.setFontSize(fontSize)
  const lines = pdf.splitTextToSize(text, contentWidth - 24)
  for (const line of lines) {
    ensureSpace(17)
    pdf.setFillColor(...colors.pale)
    pdf.roundedRect(left, y - 11, contentWidth, 16, 3, 3, 'F')
    pdf.setFont('courier', 'normal')
    pdf.setFontSize(fontSize)
    setTextColor(colors.ink)
    pdf.text(line, left + 10, y)
    y += 17
  }
}

function renderMarkdown() {
  startCover()
  const lines = markdown.replace(/\r\n/g, '\n').split('\n')
  for (const rawLine of lines) {
    const line = rawLine.trimEnd()
    if (line.startsWith('```')) {
      inCodeBlock = !inCodeBlock
      y += inCodeBlock ? 3 : 8
      continue
    }
    if (inCodeBlock) {
      renderCodeLine(line || ' ')
      continue
    }
    if (!line.trim() || line.trim() === '---') {
      y += line.trim() === '---' ? 7 : 3
      continue
    }
    const heading = line.match(/^(#{1,6})\s+(.+)$/)
    if (skippingSourceContents) {
      if (!heading) continue
      skippingSourceContents = false
    }
    if (heading) {
      const level = heading[1].length
      const title = heading[2]
      if (level === 2 && title === 'Contents') {
        skippingSourceContents = true
        continue
      }
      const fontSize = level === 2 ? 17 : level === 3 ? 12 : 22
      const gap = level === 2 ? 14 : level === 3 ? 11 : 16
      ensureSpace(fontSize + gap + 5)
      if (level === 2 && title !== 'Contents') {
        headings.push({
          title,
          level,
          page: pdf.internal.getCurrentPageInfo().pageNumber,
          top: Math.max(0, y - gap - 12),
        })
      }
      pdf.setFont('helvetica', 'bold')
      pdf.setFontSize(fontSize)
      setTextColor(level === 2 ? colors.navy : colors.blue)
      y += gap
      const wrapped = pdf.splitTextToSize(cleanInline(title), contentWidth)
      for (const wrappedLine of wrapped) {
        ensureSpace(fontSize + 6)
        pdf.text(wrappedLine, left, y)
        y += fontSize + 5
      }
      y += level === 2 ? 7 : 2
      continue
    }
    if (/^\s*[-*]\s+/.test(line)) {
      writeParagraph(`- ${line.replace(/^\s*[-*]\s+/, '')}`, { indent: 4, after: 2 })
      continue
    }
    if (/^\s*\d+\.\s+/.test(line)) {
      writeParagraph(line.replace(/^\s*(\d+)\.\s+/, '$1.  '), { indent: 4, after: 2 })
      continue
    }
    if (line.startsWith('> ')) {
      writeParagraph(line.slice(2), { font: 'helvetica', style: 'italic', color: colors.muted, indent: 10, after: 4 })
      continue
    }
    if (/^\*\*[^*]+\*\*$/.test(line)) {
      writeParagraph(line, { font: 'helvetica', style: 'bold', color: colors.navy, after: 5 })
      continue
    }
    writeParagraph(line, { after: 5 })
  }
}

renderMarkdown()
renderContents()

const totalPages = pdf.internal.getNumberOfPages()
for (let page = footerStartPage; page <= totalPages; page += 1) {
  pdf.setPage(page)
  addRunningHeader(page)
  pdf.setDrawColor(...colors.line)
  pdf.line(left, pageHeight - 42, right, pageHeight - 42)
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(8)
  setTextColor(colors.muted)
  pdf.text('Operations guide | Keep credentials private', left, pageHeight - 26)
  pdf.setTextColor(...colors.blue)
  pdf.text('Contents', left + 220, pageHeight - 26)
  pdf.link(left + 216, pageHeight - 37, 48, 14, { pageNumber: 2, top: 62 })
  pdf.text(`Page ${page - 1} of ${totalPages - 1}`, right, pageHeight - 26, { align: 'right' })
}

fs.writeFileSync(outputPath, Buffer.from(pdf.output('arraybuffer')))
console.log(`Created ${path.relative(root, outputPath)} (${totalPages} pages).`)
