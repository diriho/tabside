import type { IncomingMessage, ServerResponse } from 'node:http'

export class HttpError extends Error {
  readonly status: number
  readonly code: string

  constructor(status: number, code: string, message?: string) {
    super(message ?? code)
    this.status = status
    this.code = code
  }
}

export const MAX_BODY_BYTES = 256 * 1024

export async function readRawBody(req: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req) {
    const buf = chunk as Buffer
    size += buf.length
    if (size > MAX_BODY_BYTES) throw new HttpError(413, 'payload_too_large')
    chunks.push(buf)
  }
  return Buffer.concat(chunks)
}

export async function readJson(req: IncomingMessage): Promise<unknown> {
  const raw = await readRawBody(req)
  if (raw.length === 0) return {}
  try {
    return JSON.parse(raw.toString('utf8'))
  } catch {
    throw new HttpError(400, 'invalid_json')
  }
}

export function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(payload),
    'cache-control': 'no-store',
  })
  res.end(payload)
}

export function bearerToken(req: IncomingMessage): string | null {
  const header = req.headers.authorization
  if (!header?.startsWith('Bearer ')) return null
  return header.slice('Bearer '.length).trim() || null
}

export type Handler = (req: IncomingMessage, res: ServerResponse, params: Record<string, string>) => Promise<void>

interface Route {
  method: string
  pattern: RegExp
  keys: string[]
  handler: Handler
}

/** Minimal router: "/api/things/:id" style paths. */
export class Router {
  private routes: Route[] = []

  on(method: string, path: string, handler: Handler): this {
    const keys: string[] = []
    const pattern = new RegExp(
      '^' + path.replace(/:([a-zA-Z]+)/g, (_, key: string) => {
        keys.push(key)
        return '([^/]+)'
      }) + '/?$',
    )
    this.routes.push({ method, pattern, keys, handler })
    return this
  }

  match(method: string, pathname: string): { handler: Handler; params: Record<string, string> } | null {
    for (const route of this.routes) {
      if (route.method !== method) continue
      const m = route.pattern.exec(pathname)
      if (!m) continue
      const params: Record<string, string> = {}
      route.keys.forEach((k, i) => {
        params[k] = decodeURIComponent(m[i + 1] ?? '')
      })
      return { handler: route.handler, params }
    }
    return null
  }
}
