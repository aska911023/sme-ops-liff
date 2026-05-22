import { useState, useMemo, useEffect } from 'react'
import { Search, X, Check, ChevronDown } from 'lucide-react'

/**
 * EmployeePicker — 手機觸控專用員工選擇器
 * 點輸入框 → 全屏 modal（搜尋 + 部門/門市分群 + 大塊點擊區）
 *
 * Props:
 *   value      — 選中的 employee id (number|string|null)
 *   onChange   — (empId) => void
 *   employees  — [{id, name, position?, dept?, store?}]
 *   placeholder— '選人員'
 */
export default function EmployeePicker({ value, onChange, employees = [], placeholder = '選人員' }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')

  const selected = useMemo(
    () => employees.find(e => String(e.id) === String(value)) || null,
    [employees, value]
  )

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return employees
    return employees.filter(e => {
      const hay = `${e.name || ''} ${e.position || ''} ${e.dept || e.departments?.name || ''} ${e.store || e.stores?.name || ''}`.toLowerCase()
      return hay.includes(q)
    })
  }, [employees, query])

  // 分群（部門/門市）
  const grouped = useMemo(() => {
    const map = new Map()
    filtered.forEach(e => {
      const storeName = e.store || e.stores?.name
      const deptName  = e.dept  || e.departments?.name
      const g = storeName ? `🏪 ${storeName}` : (deptName ? `🏢 ${deptName}` : '未分類')
      if (!map.has(g)) map.set(g, [])
      map.get(g).push(e)
    })
    return [...map.entries()].sort((a, b) => b[1].length - a[1].length)
  }, [filtered])

  useEffect(() => {
    if (open) document.body.style.overflow = 'hidden'
    else document.body.style.overflow = ''
    return () => { document.body.style.overflow = '' }
  }, [open])

  const choose = (emp) => {
    onChange?.(emp ? emp.id : null)
    setOpen(false)
    setQuery('')
  }

  return (
    <>
      {/* Trigger */}
      <div
        onClick={() => setOpen(true)}
        style={{
          padding: 10, borderRadius: 8, background: 'var(--glass)', border: '1px solid var(--border)',
          color: selected ? 'var(--t1)' : 'var(--t3)', fontSize: 13,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', minHeight: 38,
        }}>
        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {selected ? selected.name : placeholder}
        </span>
        {selected ? (
          <button onClick={(e) => { e.stopPropagation(); choose(null) }}
            style={{ background: 'none', border: 'none', padding: 2, color: 'var(--t3)' }}>
            <X size={14} />
          </button>
        ) : (
          <ChevronDown size={14} style={{ color: 'var(--t3)' }} />
        )}
      </div>

      {/* Picker modal — 全螢幕 */}
      {open && (
        <div style={{
          position: 'fixed', inset: 0, background: 'var(--bg)', zIndex: 10000,
          display: 'flex', flexDirection: 'column',
        }}>
          {/* Header + search */}
          <div style={{ padding: 12, borderBottom: '1px solid var(--border)', background: 'var(--glass)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <div style={{ fontSize: 15, fontWeight: 700, flex: 1 }}>{placeholder}</div>
              <button onClick={() => { setOpen(false); setQuery('') }}
                style={{ background: 'none', border: 'none', color: 'var(--t2)', padding: 4 }}>
                <X size={20} />
              </button>
            </div>
            <div style={{ position: 'relative' }}>
              <Search size={14} style={{ position: 'absolute', top: '50%', left: 10, transform: 'translateY(-50%)', color: 'var(--t3)' }} />
              <input
                autoFocus
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder={`搜尋姓名/部門/門市（共 ${employees.length} 人）`}
                style={{
                  width: '100%', padding: '10px 10px 10px 32px',
                  background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8,
                  color: 'var(--t1)', fontSize: 13, outline: 'none',
                }}
              />
            </div>
          </div>

          {/* List */}
          <div style={{ flex: 1, overflowY: 'auto', WebkitOverflowScrolling: 'touch' }}>
            {filtered.length === 0 ? (
              <div style={{ padding: 32, textAlign: 'center', color: 'var(--t3)', fontSize: 13 }}>找不到符合的人員</div>
            ) : (
              grouped.map(([groupName, items]) => (
                <div key={groupName}>
                  <div style={{
                    padding: '8px 14px', fontSize: 11, fontWeight: 700, color: 'var(--t3)',
                    background: 'var(--glass)', letterSpacing: '0.3px',
                  }}>
                    {groupName} <span style={{ opacity: 0.6, fontWeight: 400 }}>· {items.length}</span>
                  </div>
                  {items.map(emp => {
                    const isSel = String(emp.id) === String(value)
                    return (
                      <div key={emp.id}
                        onClick={() => choose(emp)}
                        style={{
                          padding: 14, borderBottom: '1px solid var(--border)',
                          display: 'flex', alignItems: 'center', gap: 10,
                          background: isSel ? 'var(--cyan-dim)' : 'transparent',
                          cursor: 'pointer',
                        }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--t1)' }}>
                            {emp.name}
                            {emp.position && <span style={{ marginLeft: 6, fontSize: 11, fontWeight: 400, color: 'var(--t3)' }}>{emp.position}</span>}
                          </div>
                        </div>
                        {isSel && <Check size={16} style={{ color: 'var(--cyan)', flexShrink: 0 }} />}
                      </div>
                    )
                  })}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </>
  )
}
