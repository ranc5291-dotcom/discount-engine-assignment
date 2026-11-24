import { useState } from 'react'
import { parseCartPdf } from '../inputs/pdfCartParser.js'

export default function PdfUploader({ onParsed }) {
  const [busy, setBusy] = useState(false)

  async function handleChange(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return

    if (!file.name.toLowerCase().endsWith('.pdf')) {
      onParsed({ data: [], errors: ['Please choose a PDF file.'] }, file.name)
      return
    }

    setBusy(true)
    try {
      onParsed(await parseCartPdf(file), file.name)
    } catch (err) {
      onParsed({ data: [], errors: [`Could not read the PDF: ${err.message}`] }, file.name)
    } finally {
      setBusy(false)
    }
  }

  return (
    <label
      style={{
        display: 'block',
        marginTop: 10,
        padding: '10px 12px',
        border: '1px dashed #131A48',
        borderRadius: 6,
        fontSize: 12,
        color: '#131A48',
        cursor: busy ? 'wait' : 'pointer',
        textAlign: 'center',
        fontWeight: 600,
      }}
    >
      {busy ? 'Reading PDF…' : 'Or upload a cart PDF (replaces the current cart)'}
      <input
        type="file"
        accept="application/pdf,.pdf"
        onChange={handleChange}
        disabled={busy}
        style={{ display: 'none' }}
      />
    </label>
  )
}