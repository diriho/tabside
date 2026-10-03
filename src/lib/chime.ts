// A short two-note chime for new orders, synthesized (no audio asset). Browsers only allow
// audio after a user gesture, so the kitchen enables it with a tap.
let ctx: AudioContext | null = null

export function unlockChime(): boolean {
  try {
    ctx ??= new AudioContext()
    void ctx.resume()
    return true
  } catch {
    return false
  }
}

export function playChime() {
  if (!ctx || ctx.state !== 'running') return
  const start = ctx.currentTime
  for (const [i, freq] of [659.25, 987.77].entries()) {
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.value = freq
    const t = start + i * 0.16
    gain.gain.setValueAtTime(0, t)
    gain.gain.linearRampToValueAtTime(0.18, t + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.5)
    osc.connect(gain).connect(ctx.destination)
    osc.start(t)
    osc.stop(t + 0.55)
  }
}
