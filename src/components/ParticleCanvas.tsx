// Cheap pixel particle bursts (Framer can't do 200 particles cheaply). Square pixels, gravity, drag, fade.
import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'
import { useGame } from '@/store/game'

interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  life: number
  max: number
  size: number
  color: string
}

export interface ParticleHandle {
  burst(x: number, y: number, color: string, count?: number, power?: number): void
}

const MAX_PARTICLES = 400

export const ParticleCanvas = forwardRef<ParticleHandle, { className?: string }>(function ParticleCanvas({ className }, ref) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const particles = useRef<Particle[]>([])
  const raf = useRef(0)
  const reduced = useGame((s) => s.settings.reducedMotion)
  const reducedRef = useRef(reduced)
  reducedRef.current = reduced

  useEffect(() => {
    const el = canvas.current
    if (!el) return
    const resize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1)
      const r = el.getBoundingClientRect()
      el.width = Math.max(1, Math.round(r.width * dpr))
      el.height = Math.max(1, Math.round(r.height * dpr))
      const ctx = el.getContext('2d')
      ctx?.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null
    ro?.observe(el)
    return () => {
      ro?.disconnect()
      cancelAnimationFrame(raf.current)
    }
  }, [])

  const loop = () => {
    const el = canvas.current
    const ctx = el?.getContext('2d')
    if (!el || !ctx) return
    const r = el.getBoundingClientRect()
    ctx.clearRect(0, 0, r.width, r.height)
    ctx.imageSmoothingEnabled = false
    const list = particles.current
    for (let i = list.length - 1; i >= 0; i--) {
      const p = list[i]!
      p.vy += 0.22
      p.vx *= 0.97
      p.vy *= 0.97
      p.x += p.vx
      p.y += p.vy
      p.life -= 1
      if (p.life <= 0) {
        list.splice(i, 1)
        continue
      }
      ctx.globalAlpha = Math.min(1, (p.life / p.max) * 1.5)
      ctx.fillStyle = p.color
      const s = Math.round(p.size)
      ctx.fillRect(Math.round(p.x - s / 2), Math.round(p.y - s / 2), s, s)
    }
    ctx.globalAlpha = 1
    if (list.length) raf.current = requestAnimationFrame(loop)
    else raf.current = 0
  }

  useImperativeHandle(ref, () => ({
    burst(x, y, color, count = 60, power = 1) {
      if (reducedRef.current) return
      const palette = [color, color, '#f7f2e0', '#2a2438']
      for (let i = 0; i < count && particles.current.length < MAX_PARTICLES; i++) {
        const a = Math.random() * Math.PI * 2
        const sp = (1.5 + Math.random() * 4.5) * power
        const life = 28 + Math.random() * 26
        particles.current.push({
          x,
          y,
          vx: Math.cos(a) * sp,
          vy: Math.sin(a) * sp - 2,
          life,
          max: life,
          size: 3 + Math.random() * 4,
          color: palette[i % palette.length]!,
        })
      }
      if (!raf.current) raf.current = requestAnimationFrame(loop)
    },
  }))

  return <canvas ref={canvas} className={className} aria-hidden style={{ pointerEvents: 'none' }} />
})
