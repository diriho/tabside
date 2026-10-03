// Runs the web app and the API together; Ctrl+C stops both.
//   npm run dev       → http://localhost:5173 (this computer only)
//   npm run dev:lan   → also reachable from phones on the same Wi-Fi; QR codes use this Mac's address
import { spawn } from 'node:child_process'
import { networkInterfaces } from 'node:os'

const lan = process.argv.includes('--lan')
const env = { ...process.env }
let lanUrl = null

if (lan) {
  const ip = Object.values(networkInterfaces())
    .flat()
    .find((i) => i && i.family === 'IPv4' && !i.internal)?.address
  if (!ip) {
    console.error('No network address found — are you connected to Wi-Fi?')
    process.exit(1)
  }
  lanUrl = `http://${ip}:5173`
  // Already-set env vars take precedence over .env files in both Vite and the API.
  env.VITE_PUBLIC_APP_URL = lanUrl // printed into QR codes
  env.APP_URL = lanUrl // where Stripe Checkout returns the guest
}

const procs = [
  { name: 'web', color: '\x1b[33m', cmd: ['npm', 'run', 'dev:web', ...(lan ? ['--', '--host'] : [])] },
  { name: 'api', color: '\x1b[36m', cmd: ['npm', 'run', 'dev:api'] },
]

const children = procs.map(({ name, color, cmd }) => {
  const child = spawn(cmd[0], cmd.slice(1), { stdio: ['ignore', 'pipe', 'pipe'], env })
  const prefix = `${color}[${name}]\x1b[0m `
  const forward = (stream, out) =>
    stream.on('data', (chunk) => {
      for (const line of chunk.toString().split('\n')) if (line.trim()) out.write(prefix + line + '\n')
    })
  forward(child.stdout, process.stdout)
  forward(child.stderr, process.stderr)
  child.on('exit', (code) => {
    if (code !== 0 && code !== null) console.error(`${prefix}exited with ${code}`)
  })
  return child
})

if (lanUrl) {
  // A scannable code for the demo's Table 3, right in the terminal.
  const { default: QRCode } = await import('qrcode')
  const table3 = `${lanUrl}/r/the-globe/table/a0000000-0000-4000-8000-000000000003`
  const qr = await QRCode.toString(table3, { type: 'terminal', small: true })
  setTimeout(() => {
    console.log(`\n\x1b[1mOn your phone (same Wi-Fi):\x1b[0m ${lanUrl}`)
    console.log(`Scan to join The Globe, Table 3:\n${qr}`)
    console.log('Every table’s printable code is in Admin → Tables & QR codes.\n')
  }, 1500)
}

const stop = () => {
  for (const child of children) child.kill('SIGTERM')
  process.exit(0)
}
process.on('SIGINT', stop)
process.on('SIGTERM', stop)
