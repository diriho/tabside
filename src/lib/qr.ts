import QRCode from 'qrcode'

/** Public origin baked into printed QR codes (set VITE_PUBLIC_APP_URL in production). */
export function publicOrigin(): string {
  const configured = import.meta.env.VITE_PUBLIC_APP_URL as string | undefined
  return (configured || window.location.origin).replace(/\/$/, '')
}

/** The QR identifies only restaurant + table — no secrets, no session ids. */
export function tableUrl(slug: string, tableId: string): string {
  return `${publicOrigin()}/r/${slug}/table/${tableId}`
}

const QR_OPTIONS = { errorCorrectionLevel: 'M' as const, margin: 1, color: { dark: '#2A1E17', light: '#FFFFFF' } }

export function qrDataUrl(text: string, width = 640): Promise<string> {
  return QRCode.toDataURL(text, { ...QR_OPTIONS, width })
}

export function qrSvg(text: string): Promise<string> {
  return QRCode.toString(text, { ...QR_OPTIONS, type: 'svg' })
}

export function download(filename: string, href: string) {
  const a = document.createElement('a')
  a.href = href
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
}
