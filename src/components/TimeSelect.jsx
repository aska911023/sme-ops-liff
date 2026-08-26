import { useState, useRef, useEffect } from 'react'

// 共用時間選擇器(iOS 風滾輪):取代原生 <input type="time">。
// 原因:原生時間輸入外觀由 OS 控制 — 三星(Android)跳很醜的時鐘、iOS 是滾輪、格式也不一致。
// 這支自訂滾輪全平台長一樣、精確到分鐘(補打卡等需要)、不會跳系統時鐘。
// value / onChange 皆用 "HH:MM" 字串(與原生 input 相同),換上去不動送出/計算邏輯。

const ITEM_H = 40
const VISIBLE = 5                       // 顯示幾列(奇數,中間為選中)
const PAD = ((VISIBLE - 1) / 2) * ITEM_H
const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'))
const MINS = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0'))

function Wheel({ items, value, onChange }) {
  const ref = useRef(null)
  const timer = useRef(null)
  // 開啟時滾到目前值(等版面就緒)
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
    }, 90)
  }

  return (
    <div ref={ref} onScroll={onScroll} className="tw-wheel" style={{
      height: VISIBLE * ITEM_H, overflowY: 'scroll', scrollSnapType: 'y mandatory',
      WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none', flex: 1,
    }}>
      <div style={{ height: PAD }} />
      {items.map(it => (
        <div key={it} style={{
          height: ITEM_H, scrollSnapAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 22, fontWeight: it === value ? 700 : 400,
          color: it === value ? 'var(--accent, #0f9d8a)' : 'var(--t3, #9aa5b1)',
        }}>{it}</div>
      ))}
      <div style={{ height: PAD }} />
    </div>
  )
}

export default function TimeSelect({ value, onChange, className = 'form-input' }) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState(value || '09:00')
  const openPicker = () => { setDraft(value || '09:00'); setOpen(true) }
  const dparts = (draft || '09:00').split(':')
  const dh = dparts[0] || '09'
  const dm = dparts[1] || '00'

  return (
    <>
      <button type="button" className={className} onClick={openPicker}
        style={{ textAlign: 'left', cursor: 'pointer', width: '100%' }}>
        {value || '選擇時間'}
      </button>
      {open && (
        <div onClick={() => setOpen(false)} style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', zIndex: 9999,
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
        }}>
          <style>{`.tw-wheel::-webkit-scrollbar{display:none}`}</style>
          <div onClick={e => e.stopPropagation()} style={{
            background: 'var(--card, #fff)', borderRadius: 16, width: '100%', maxWidth: 300, overflow: 'hidden',
            boxShadow: '0 12px 44px rgba(0,0,0,.35)',
          }}>
            <div style={{
              padding: '16px', fontSize: 34, fontWeight: 700, textAlign: 'center', letterSpacing: 2,
              color: '#fff', background: 'var(--accent, #0f9d8a)',
            }}>{dh}:{dm}</div>
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center', padding: '8px 28px' }}>
              {/* 中央選中帶 */}
              <div style={{
                position: 'absolute', left: 16, right: 16, top: 8 + PAD, height: ITEM_H,
                background: 'var(--glass, #eef1f4)', borderRadius: 8, pointerEvents: 'none',
              }} />
              <Wheel items={HOURS} value={dh} onChange={h => setDraft(`${h}:${dm}`)} />
              <span style={{ fontSize: 24, fontWeight: 700, padding: '0 6px', color: 'var(--t2, #555)' }}>:</span>
              <Wheel items={MINS} value={dm} onChange={m => setDraft(`${dh}:${m}`)} />
            </div>
            <div style={{ display: 'flex', borderTop: '1px solid var(--border, #eee)' }}>
              <button type="button" onClick={() => setOpen(false)} style={{
                flex: 1, padding: 14, background: 'none', border: 'none', fontSize: 16, color: 'var(--t2, #666)',
              }}>取消</button>
              <button type="button" onClick={() => { onChange(draft); setOpen(false) }} style={{
                flex: 1, padding: 14, background: 'none', border: 'none', borderLeft: '1px solid var(--border, #eee)',
                fontSize: 16, fontWeight: 700, color: 'var(--accent, #0f9d8a)',
              }}>設定</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
