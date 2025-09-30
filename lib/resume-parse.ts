// resume-parse.ts
export type ParsedResume = {
  name?: string
  email?: string
  phone?: string
}

const EMAIL_REGEX = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i
const PHONE_REGEX = /(?:\+?91[\s-]*)?0?\s*[6-9]\d(?:[\s-]?\d){8}/g

// ---------------------- Normalize Indian Phone ----------------------
function normalizeIndianPhone(input: string): string | null {
  const digits = input.replace(/\D/g, "")
  let d = digits
  if (d.startsWith("91") && d.length >= 12) d = d.slice(-10)
  if (d.startsWith("0") && d.length === 11) d = d.slice(1)
  if (d.length === 10 && /^[6-9]\d{9}$/.test(d)) return `+91${d}`
  return null
}

// ---------------------- Extract core fields ----------------------
function extractFieldsFromText(raw: string): ParsedResume {
  const cleaned = raw
    .replace(/\r/g, "")
    .replace(/\s*(?:$$|\[|\{)?\s*at\s*(?:$$|\]|\})?\s*/gi, "@")
    .replace(/\s*(?:$$|\[|\{)?\s*dot\s*(?:$$|\]|\})?\s*/gi, ".")
    .replace(/mailto:\s*/gi, "")

  const lines = cleaned
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)

  const email = cleaned.match(EMAIL_REGEX)?.[0]

  const phonesRaw = [...cleaned.matchAll(PHONE_REGEX)].map((m) => m[0])
  const normalizedPhones = phonesRaw.map((p) => normalizeIndianPhone(p)).filter((p): p is string => !!p)
  const phone = normalizedPhones[0] || undefined

  function looksLikeName(s: string) {
    if (!s || /\d/.test(s)) return false
    if (/email|phone|github|linkedin|education|experience|summary|address|resume|curriculum vitae|^cv$/i.test(s))
      return false
    const words = s.split(/\s+/).filter(Boolean)
    if (words.length < 2 || words.length > 5) return false
    return words.every((w) => /^[A-Z][a-z'.-]+$/.test(w) || /^[A-Z]{2,}$/.test(w))
  }

  let name: string | undefined
  const topWindow = lines.slice(0, 10)
  name = topWindow.find(looksLikeName)

  if (!name && email) {
    const idx = lines.findIndex((l) => l.includes(email))
    for (let i = 1; i <= 2; i++) {
      const prev = lines[idx - i]
      if (prev && looksLikeName(prev)) {
        name = prev
        break
      }
      const next = lines[idx + i]
      if (!name && next && looksLikeName(next)) {
        name = next
        break
      }
    }
  }

  return { name, email, phone }
}

// ---------------------- DOCX parsing ----------------------
async function extractTextFromDocx(arrayBuffer: ArrayBuffer): Promise<string> {
  const { default: JSZip } = await import("jszip")
  const zip = await JSZip.loadAsync(arrayBuffer)
  const docXml = await zip.file("word/document.xml")?.async("string")
  if (!docXml) return ""
  return docXml
    .replace(/<w:p[^>]*>/g, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
}

// ---------------------- PDF text parsing ----------------------
async function extractTextFromPdf(arrayBuffer: ArrayBuffer): Promise<string> {
  try {
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf")
    // @ts-ignore
    pdfjs.GlobalWorkerOptions.workerSrc = ""
    // @ts-ignore
    const loadingTask = pdfjs.getDocument({ data: arrayBuffer })
    const pdf = await loadingTask.promise
    let fullText = ""
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i)
      const content = await page.getTextContent()
      const strings = content.items?.map((it: any) => it.str).filter(Boolean) ?? []
      fullText += strings.join(" ") + "\n"
    }
    return fullText.trim()
  } catch {
    return ""
  }
}

// ---------------------- OCR fallback (images + scanned PDFs) ----------------------
async function extractTextWithOCR(arrayBuffer: ArrayBuffer, mimeType?: string): Promise<string> {
  let worker: any | null = null
  const imageUrl: string | null = null

  try {
    const { createWorker } = await import("tesseract.js")
    worker = await createWorker()
    await worker.load()
    await worker.loadLanguage("eng")
    await worker.initialize("eng")

    const blobToDataURL = (blob: Blob) =>
      new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(String(reader.result || ""))
        reader.onerror = reject
        reader.readAsDataURL(blob)
      })

    if (mimeType?.startsWith("image/")) {
      const blob = new Blob([arrayBuffer], { type: mimeType })
      const dataUrl = await blobToDataURL(blob)
      const {
        data: { text },
      } = await worker.recognize(dataUrl)
      return text || ""
    } else if (mimeType === "application/pdf") {
      const pdfjs = await import("pdfjs-dist/legacy/build/pdf")
      // @ts-ignore
      pdfjs.GlobalWorkerOptions.workerSrc = ""
      const loadingTask = pdfjs.getDocument({ data: arrayBuffer })
      const pdf = await loadingTask.promise
      let fullText = ""
      const MAX_PAGES = Math.min(pdf.numPages, 15)
      for (let i = 1; i <= MAX_PAGES; i++) {
        const page = await pdf.getPage(i)
        const viewport = page.getViewport({ scale: 2.0 })
        if (typeof document === "undefined") continue
        const canvas = document.createElement("canvas")
        canvas.width = Math.floor(viewport.width)
        canvas.height = Math.floor(viewport.height)
        const ctx = canvas.getContext("2d")
        if (!ctx) continue
        await page.render({ canvasContext: ctx, viewport }).promise

        const dataUrl = canvas.toDataURL("image/png")
        const {
          data: { text },
        } = await worker.recognize(dataUrl)
        fullText += (text || "") + "\n"
      }
      return fullText
    }
    return ""
  } catch (err) {
    console.warn("OCR failed:", err)
    return ""
  } finally {
    try {
      await worker?.terminate?.()
    } catch {}
    if (imageUrl && imageUrl.startsWith("blob:")) URL.revokeObjectURL(imageUrl)
  }
}

// ---------------------- Main entry ----------------------
export async function parseResume(file: File): Promise<ParsedResume> {
  const arrayBuffer = await file.arrayBuffer()
  let text = ""

  if (file.type === "application/pdf") {
    text = await extractTextFromPdf(arrayBuffer)
    if (!text.trim()) text = await extractTextWithOCR(arrayBuffer, "application/pdf")
  } else if (file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
    text = await extractTextFromDocx(arrayBuffer)
  } else {
    try {
      text = new TextDecoder().decode(arrayBuffer)
    } catch {
      text = ""
    }
  }

  return extractFieldsFromText(text)
}
