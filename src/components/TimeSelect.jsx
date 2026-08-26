import { useState, useRef, useEffect } from 'react'

// 共用時間選擇器(質感滾輪):取代原生 <input type="time">。
// 原生時間輸入外觀由 OS 控制 — 三星跳醜時鐘、iOS 是滾輪、格式不一致。
// 這支自訂滾輪全平台一致、精確到分、含上下淡出遮罩與柔和選取帶,配色吃品牌 cyan→blue。
// value / onChange 皆用 "HH:MM" 字串(同原生 input),不動送出/計算邏輯。

const ITEM_H = 44
const VISIBLE = 5
const PAD = ((VISIBLE - 1) / 2) * ITEM_H
const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'))
const MINS = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0'))
const FADE = 'linear-gradient(180deg, transparent 0%, #000 30%, #000 70%, transparent 100%)'
const BRAND = 'linear-gradient(135deg, var(--cyan, #22d3ee), var(--blue, #3b82f6))'

function Wheel({ items, value, onChange }) {
  const ref = useRef(null)
  const timer = useRef(null)
  useEffect(() => {
    const i = Math.max(0, items.indexOf(value))
    const el = ref.current
    if (el) requestAnimationFrame(() => { el.scrollTop = i * ITEM_H })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const onScroll = () => {
    clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      const el = ref.current
      if (!el) return
      let i = Math.round(el.scrollTop / ITEM_H)
      i = Math.max(0, Math.min(items.length - 1, i))
      const target = i * ITEM_H
      if (Math.abs(el.scrollTop - target) > 1) el.scrollTop = target
      if (items[i] !== value) onChange(items[i])
    }, 80)
  }

  return (
    <div ref={ref} onScroll={onScroll} className="tw-wheel" style={{
      height: VISIBLE * ITEM_H, overflowY: 'scroll', scrollSnapType: 'y mandatory',
      WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none', flex: 1,
      WebkitMaskImage: FADE, maskImage: FADE,
    }}>
      <div style={{ height: PAD }} />
      {items.map(it => {
        const on = it === value
        return (
          <div key={it} style={{
            height: ITEM_H, scrollSnapAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: on ? 26 : 19, fontWeight: on ? 700 : 400, fontVariantNumeric: 'tabular-nums',
            color: on ? 'var(--t1, #1e293b)' : 'var(--t3, #94a3b8)',
            opacity: on ? 1 : 0.75, letterSpacing: 2, transition: 'font-size .12s, color .12s, opacity .12s',
          }}>{it}</div>
        )
      })}
      <div style={{ height: PAD }} />
    </div>
  )
}

export default function TimeSelect({ value, onChange, className = 'form-input' }) {
  const [open, setOpen] = useState(false)
  const [shown, setShown] = useState(false)
  const [draft, setDraft] = useState(value || '09:00')

  const openPicker = () => {
    setDraft(value || '09:00'); setOpen(true)
    requestAnimationFrame(() => setShown(true))
  }
  const close = () => { setShown(false); setTimeout(() => setOpen(false), 240) }
  const confirm = () => { onChange(draft); close() }

  const p = (draft || '09:00').split(':')
  const dh = p[0] || '09'
  const dm = p[1] || '00'

  return (
    <>
      <button type="button" className={className} onClick={openPicker}
        style={{ textAlign: 'left', cursor: 'pointer', width: '100%', fontVariantNumeric: 'tabular-nums' }}>
        {value || '選擇時間'}
      </button>
      {open && (
        <div onClick={close} style={{
          position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
          background: 'rgba(2,6,23,.5)', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)',
          opacity: shown ? 1 : 0, transition: 'opacity .24s ease',
        }}>
          <style>{`.tw-wheel::-webkit-scrollbar{display:none}`}</style>
          <div onClick={e => e.stopPropagation()} style={{
            background: 'var(--card, #fff)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
            width: '100%', maxWidth: 440, borderRadius: '26px 26px 0 0', overflow: 'hidden',
            paddingBottom: 'calc(env(safe-area-inset-bottom, 8px) + 8px)',
            border: '1px solid var(--border, rgba(0,0,0,.06))', borderBottom: 'none',
            boxShadow: '0 -10px 50px rgba(2,6,23,.28)',
            transform: shown ? 'translateY(0)' : 'translateY(100%)',
            transition: 'transform .28s cubic-bezier(.32,.72,0,1)',
          }}>
            {/* 拖曳握把 */}
            <div style={{ width: 38, height: 5, borderRadius: 3, background: 'var(--border2, rgba(148,163,184,.35))', margin: '9px auto 0' }} />
            {/* 頂列:取消 · 標題 · 完成(漸層膠囊) */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px 8px' }}>
              <button type="button" onClick={close} style={{ background: 'none', border: 'none', fontSize: 15, color: 'var(--t3, #94a3b8)', padding: '6px 4px' }}>取消</button>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--t2, #64748b)', letterSpacing: 2 }}>選擇時間</span>
              <button type="button" onClick={confirm} style={{
                border: 'none', fontSize: 14, fontWeight: 700, color: '#fff', background: BRAND,
                padding: '7px 18px', borderRadius: 999, boxShadow: '0 3px 10px rgba(59,130,246,.32)',
              }}>完成</button>
            </div>
            {/* 滾輪 */}
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center', padding: '6px 44px 20px' }}>
              {/* 柔和選取帶 */}
              <div style={{
                position: 'absolute', left: 30, right: 30, top: 6 + PAD, height: ITEM_H,
                background: 'var(--glass, rgba(120,130,145,.06))', borderRadius: 14,
                border: '1px solid var(--border, rgba(0,0,0,.05))', pointerEvents: 'none',
              }} />
              <Wheel items={HOURS} value={dh} onChange={h => setDraft(`${h}:${dm}`)} />
              <span style={{ fontSize: 24, fontWeight: 700, padding: '0 2px', color: 'var(--t2, #64748b)', transform: 'translateY(-2px)', opacity: .6 }}>:</span>
              <Wheel items={MINS} value={dm} onChange={m => setDraft(`${dh}:${m}`)} />
            </div>
          </div>
        </div>
      )}
    </>
  )
}
