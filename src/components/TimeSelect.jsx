import { useState, useRef, useEffect } from 'react'

// 共用時間選擇器(質感滾輪):取代原生 <input type="time">。
// 原生時間輸入外觀由 OS 控制 — 三星跳醜時鐘、iOS 是滾輪、格式不一致。
// 這支自訂滾輪全平台一致、精確到分、含上下淡出遮罩與柔和選取帶。
// value / onChange 皆用 "HH:MM" 字串(同原生 input),換上去不動送出/計算邏輯。

const ITEM_H = 44
const VISIBLE = 5
const PAD = ((VISIBLE - 1) / 2) * ITEM_H
const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'))
const MINS = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0'))
const FADE = 'linear-gradient(180deg, transparent 0%, #000 28%, #000 72%, transparent 100%)'

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
            fontSize: on ? 24 : 20, fontWeight: on ? 600 : 400, fontVariantNumeric: 'tabular-nums',
            color: on ? 'var(--t1, #1c1c1e)' : 'var(--t3, #b0b6be)',
            letterSpacing: 1, transition: 'font-size .12s, color .12s',
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
  const close = () => { setShown(false); setTimeout(() => setOpen(false), 220) }
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
          background: 'rgba(0,0,0,.45)', backdropFilter: 'blur(3px)', WebkitBackdropFilter: 'blur(3px)',
          opacity: shown ? 1 : 0, transition: 'opacity .22s ease',
        }}>
          <style>{`.tw-wheel::-webkit-scrollbar{display:none}`}</style>
          <div onClick={e => e.stopPropagation()} style={{
            background: 'var(--card, #fff)', width: '100%', maxWidth: 440,
            borderRadius: '22px 22px 0 0', overflow: 'hidden', paddingBottom: 'env(safe-area-inset-bottom, 8px)',
            boxShadow: '0 -8px 40px rgba(0,0,0,.22)',
            transform: shown ? 'translateY(0)' : 'translateY(100%)',
            transition: 'transform .26s cubic-bezier(.32,.72,0,1)',
          }}>
            {/* 頂列:取消 · 標題 · 完成 */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '14px 18px 10px', borderBottom: '1px solid var(--border, #ececec)',
            }}>
              <button type="button" onClick={close} style={{ background: 'none', border: 'none', fontSize: 15, color: 'var(--t3, #9aa5b1)', padding: 4 }}>取消</button>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--t3, #9aa5b1)', letterSpacing: 1 }}>選擇時間</span>
              <button type="button" onClick={confirm} style={{ background: 'none', border: 'none', fontSize: 15, fontWeight: 700, color: 'var(--accent, #0f9d8a)', padding: 4 }}>完成</button>
            </div>
            {/* 滾輪 */}
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center', padding: '10px 40px 18px' }}>
              {/* 柔和選取帶 */}
              <div style={{
                position: 'absolute', left: 28, right: 28, top: 10 + PAD, height: ITEM_H,
                background: 'var(--glass, rgba(120,130,145,.10))', borderRadius: 12, pointerEvents: 'none',
              }} />
              <Wheel items={HOURS} value={dh} onChange={h => setDraft(`${h}:${dm}`)} />
              <span style={{ fontSize: 22, fontWeight: 600, padding: '0 2px', color: 'var(--t2, #6b7280)', transform: 'translateY(-1px)' }}>:</span>
              <Wheel items={MINS} value={dm} onChange={m => setDraft(`${dh}:${m}`)} />
            </div>
          </div>
        </div>
      )}
    </>
  )
}
