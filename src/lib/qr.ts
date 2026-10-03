import QRCode from 'qrcode'

/**
 * Public origin baked into printed QR codes: VITE_PUBLIC_APP_URL in production. In development,
 * if you're browsing over HTTPS (e.g. a cloudflared tunnel) while the configured address is plain
 * http or localhost, use the address you're on — that's the one a phone can actually open.
 */
export function publicOrigin(): string {
  const configured = (import.meta.env.VITE_PUBLIC_APP_URL as string | undefined)?.replace(/\/$/, '')
  const current = window.location.origin
  if (!configured) return current
  const configuredIsLocal = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:|$)/.test(configured)
  const currentIsLocal = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:|$)/.test(current)
  if (configuredIsLocal && !currentIsLocal) return current
  if (configured.startsWith('http://') && current.startsWith('https://')) return current
  return configured
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
