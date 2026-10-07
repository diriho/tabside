// Vercel serverless entry. Bundled by scripts/build-vercel.mjs into one self-contained file and
// mounted at every path in API_ROUTES, so req.url is always the real /api/... path.
import type { IncomingMessage, ServerResponse } from 'node:http'
import { createHandler, type RequestHandler } from './app.ts'
import { loadEnv } from './env.ts'

let handler: RequestHandler | undefined

export default async function vercelHandler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  // Created lazily and reused across invocations of a warm function.
  handler ??= createHandler(loadEnv(process.env))
  await handler(req, res)
}
