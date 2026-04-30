import { useState, useEffect } from 'react'
import { Type } from 'lucide-react'
import { getFontScale, setFontScale, FONT_SCALE_LIMITS } from '../lib/fontScale'

export default function FontSizeControl() {
  const [scale, setScale] = useState(getFontScale())

  useEffect(() => {
    setScale(getFontScale())
  }, [])

  const bump = (delta) => {
    const next = Math.round((scale + delta) * 100) / 100
    setScale(setFontScale(next))
  }
  const reset = () => setScale(setFontScale(FONT_SCALE_LIMITS.DEFAULT))

  const atMin = scale <= FONT_SCALE_LIMITS.MIN + 0.001
  const atMax = scale >= FONT_SCALE_LIMITS.MAX - 0.001

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 6,
      padding: '8px 12px',
      borderRadius: 12,
      background: 'var(--card)',
      border: '1.5px solid var(--border2)',
      fontSize: 13,
    }}>
      <Type size={14} style={{ color: 'var(--t3)', flexShrink: 0 }} />
      <span style={{ fontSize: 12, color: 'var(--t3)', marginRight: 4 }}>字體</span>
      <button
        onClick={() => bump(-FONT_SCALE_LIMITS.STEP)}
        disabled={atMin}
        style={btn(atMin)}
      >A-</button>
      <button
        onClick={reset}
        style={{ ...btn(false), minWidth: 48 }}
      >{Math.round(scale * 100)}%</button>
      <button
        onClick={() => bump(FONT_SCALE_LIMITS.STEP)}
        disabled={atMax}
        style={btn(atMax)}
      >A+</button>
    </div>
  )
}

const btn = (disabled) => ({
  padding: '6px 10px',
  borderRadius: 8,
  border: '1.5px solid var(--border2)',
  background: 'transparent',
  color: disabled ? 'var(--t3)' : 'var(--t1)',
  fontSize: 13,
  fontWeight: 700,
  cursor: disabled ? 'not-allowed' : 'pointer',
  opacity: disabled ? 0.4 : 1,
  flex: 1,
})
