// Runs the web app and the API together; Ctrl+C stops both.
import { spawn } from 'node:child_process'

const procs = [
  { name: 'web', color: '\x1b[33m', cmd: ['npm', 'run', 'dev:web'] },
  { name: 'api', color: '\x1b[36m', cmd: ['npm', 'run', 'dev:api'] },
]

const children = procs.map(({ name, color, cmd }) => {
  const child = spawn(cmd[0], cmd.slice(1), { stdio: ['ignore', 'pipe', 'pipe'], env: process.env })
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

const stop = () => {
  for (const child of children) child.kill('SIGTERM')
  process.exit(0)
}
process.on('SIGINT', stop)
process.on('SIGTERM', stop)
