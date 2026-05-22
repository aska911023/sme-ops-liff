import { useRef, useState, useEffect } from 'react'
import { RotateCcw, Check, X } from 'lucide-react'

// 手機觸控版簽名 modal
export default function SignaturePad({ open, signerName, onConfirm, onClose }) {
  const canvasRef = useRef(null)
  const [drawing, setDrawing] = useState(false)
  const [hasDrawn, setHasDrawn] = useState(false)

  useEffect(() => {
    if (!open) return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    const dpr = window.devicePixelRatio || 1
    const rect = canvas.getBoundingClientRect()
    canvas.width = rect.width * dpr
    canvas.height = rect.height * dpr
    ctx.scale(dpr, dpr)
    ctx.strokeStyle = '#111111'
    ctx.lineWidth = 3
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, rect.width, rect.height)
    setHasDrawn(false)
  }, [open])

  const getPos = (e) => {
    const canvas = canvasRef.current
    const rect = canvas.getBoundingClientRect()
    const touch = e.touches?.[0]
    const x = (touch ? touch.clientX : e.clientX) - rect.left
    const y = (touch ? touch.clientY : e.clientY) - rect.top
    return { x, y }
  }

  const start = (e) => {
    e.preventDefault()
    setDrawing(true)
    const { x, y } = getPos(e)
    const ctx = canvasRef.current.getContext('2d')
    ctx.beginPath()
    ctx.moveTo(x, y)
  }
  const move = (e) => {
    if (!drawing) return
    e.preventDefault()
    const { x, y } = getPos(e)
    const ctx = canvasRef.current.getContext('2d')
    ctx.lineTo(x, y)
    ctx.stroke()
    setHasDrawn(true)
  }
  const end = (e) => { e?.preventDefault?.(); setDrawing(false) }

  const clear = () => {
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    const rect = canvas.getBoundingClientRect()
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, rect.width, rect.height)
    setHasDrawn(false)
  }

  const submit = () => {
    if (!hasDrawn) return
    onConfirm(canvasRef.current.toDataURL('image/png'))
  }

  if (!open) return null

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 10100,
      display: 'flex', flexDirection: 'column',
    }}>
      <div style={{ padding: 16, color: '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 700 }}>請簽名</div>
          <div style={{ fontSize: 12, opacity: 0.7, marginTop: 2 }}>{signerName}</div>
        </div>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer' }}>
          <X size={24} />
        </button>
      </div>

      <div style={{ flex: 1, padding: 16, display: 'flex', alignItems: 'center' }}>
        <div style={{
          width: '100%', aspectRatio: '2/1', background: '#fff', borderRadius: 8,
          position: 'relative', overflow: 'hidden',
        }}>
          <canvas
            ref={canvasRef}
            style={{ width: '100%', height: '100%', touchAction: 'none', display: 'block' }}
            onMouseDown={start} onMouseMove={move} onMouseUp={end} onMouseLeave={end}
            onTouchStart={start} onTouchMove={move} onTouchEnd={end}
          />
          {!hasDrawn && (
            <div style={{
              position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#bbb', fontSize: 14, pointerEvents: 'none',
            }}>
              在此處簽名
            </div>
          )}
        </div>
      </div>

      <div style={{ padding: 16, display: 'flex', gap: 8 }}>
        <button onClick={clear} disabled={!hasDrawn} style={{
          flex: 1, padding: 14, borderRadius: 10, border: '1px solid rgba(255,255,255,0.3)',
          background: 'transparent', color: '#fff', fontSize: 14, fontWeight: 600,
          opacity: hasDrawn ? 1 : 0.4, cursor: 'pointer',
        }}>
          <RotateCcw size={16} style={{ verticalAlign: 'middle', marginRight: 6 }} />重簽
        </button>
        <button onClick={submit} disabled={!hasDrawn} style={{
          flex: 2, padding: 14, borderRadius: 10, border: 'none',
          background: '#22c55e', color: '#fff', fontSize: 14, fontWeight: 700,
          opacity: hasDrawn ? 1 : 0.4, cursor: 'pointer',
        }}>
          <Check size={16} style={{ verticalAlign: 'middle', marginRight: 6 }} />完成簽名
        </button>
      </div>
    </div>
  )
}
