import jsPDF from 'jspdf'
import { MenuCategory, MenuItem } from '../types'

const GOLD = [200, 168, 78] as const
const WHITE = [255, 255, 255] as const
const GRAY = [156, 163, 175] as const
const BLACK = [0, 0, 0] as const

export function generateMenuPdf(categories: MenuCategory[], items: MenuItem[]) {
  const doc = new jsPDF('p', 'mm', 'letter')
  const pageWidth = doc.internal.pageSize.getWidth()
  const margin = 20
  const contentWidth = pageWidth - margin * 2
  let y = 30

  const addBlackPage = () => {
    doc.setFillColor(...BLACK)
    doc.rect(0, 0, pageWidth, doc.internal.pageSize.getHeight(), 'F')
  }

  const checkPageBreak = (needed: number) => {
    if (y + needed > doc.internal.pageSize.getHeight() - 30) {
      doc.addPage()
      addBlackPage()
      y = 30
    }
  }

  const addFooter = () => {
    doc.setFontSize(8)
    doc.setTextColor(...GOLD)
    doc.text('White Corn Tortillas  |  Cooked in Beef Tallow', pageWidth / 2, doc.internal.pageSize.getHeight() - 15, { align: 'center' })
  }

  // Page 1
  addBlackPage()

  // Title
  y = 50
  doc.setFontSize(32)
  doc.setTextColor(...WHITE)
  doc.text('TACOS MIRANDA', pageWidth / 2, y, { align: 'center' })

  // Gold line
  y += 10
  doc.setDrawColor(...GOLD)
  doc.setLineWidth(0.5)
  doc.line(pageWidth / 2 - 30, y, pageWidth / 2 + 30, y)

  // Tagline
  y += 10
  doc.setFontSize(10)
  doc.setTextColor(...GRAY)
  doc.text('Handcrafted with white corn tortillas, cooked in premium beef tallow', pageWidth / 2, y, { align: 'center' })

  y += 20

  // Categories
  const sortedCategories = [...categories].sort((a, b) => a.sort_order - b.sort_order)

  for (const cat of sortedCategories) {
    const catItems = items
      .filter(i => i.category_id === cat.id)
      .sort((a, b) => a.sort_order - b.sort_order)

    if (catItems.length === 0) continue

    checkPageBreak(30)

    // Category heading
    doc.setFontSize(16)
    doc.setTextColor(...GOLD)
    doc.text(cat.name.toUpperCase(), pageWidth / 2, y, { align: 'center' })

    y += 4
    doc.setDrawColor(...GOLD)
    doc.setLineWidth(0.3)
    const headingWidth = doc.getTextWidth(cat.name.toUpperCase())
    doc.line(pageWidth / 2 - headingWidth / 2, y, pageWidth / 2 + headingWidth / 2, y)
    y += 10

    for (const item of catItems) {
      checkPageBreak(16)

      // Item name
      doc.setFontSize(11)
      doc.setTextColor(...WHITE)
      const nameText = item.name
      doc.text(nameText, margin, y)

      // Price
      const priceText = `$${item.price.toFixed(2)}`
      doc.setTextColor(...GOLD)
      doc.text(priceText, pageWidth - margin, y, { align: 'right' })

      // Dotted line
      const nameWidth = doc.getTextWidth(nameText)
      const priceWidth = doc.getTextWidth(priceText)
      const dotsStart = margin + nameWidth + 2
      const dotsEnd = pageWidth - margin - priceWidth - 2
      if (dotsEnd > dotsStart + 5) {
        doc.setDrawColor(200, 168, 78)
        doc.setLineDashPattern([0.5, 2], 0)
        doc.setLineWidth(0.2)
        doc.line(dotsStart, y - 0.5, dotsEnd, y - 0.5)
        doc.setLineDashPattern([], 0)
      }

      // Description
      if (item.description) {
        y += 5
        doc.setFontSize(8)
        doc.setTextColor(...GRAY)
        const descLines = doc.splitTextToSize(item.description, contentWidth)
        doc.text(descLines, margin, y)
        y += descLines.length * 3.5
      }

      y += 8
    }

    y += 6
  }

  // Add footer to all pages
  const pageCount = doc.getNumberOfPages()
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i)
    addFooter()
  }

  doc.save('TacosMiranda-Menu.pdf')
}
