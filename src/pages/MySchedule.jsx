import { useState, useEffect } from 'react'
import { ChevronLeft, ChevronRight, Repeat, X } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { notifyShiftSwapEvent } from '../lib/approvalNotify'

const DAY_LABELS = ['一', '二', '三', '四', '五', '六', '日']

function getWeekDates(offset = 0) {
  const now = new Date()
  const day = now.getDay() || 7
  const mon = new Date(now)
  mon.setDate(now.getDate() - day + 1 + offset * 7)
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(mon)
    d.setDate(mon.getDate() + i)
    return d.toISOString().slice(0, 10)
  })
}

export default function MySchedule() {
  const { lineProfile } = useAuth()
  const navigate = useNavigate()
  const [weekOffset, setWeekOffset] = useState(0)
  const [schedules, setSchedules] = useState([])
  const [holidays, setHolidays] = useState({}) // { '2026-04-04': '兒童節' }
  const [shiftDefs, setShiftDefs] = useState([])
  const [loading, setLoading] = useState(true)
  const [swapModal, setSwapModal] = useState(null) // { date, myShift }
  const [viewMode, setViewMode] = useState('mine')  // 'mine' | 'store'
  const [storeSchedules, setStoreSchedules] = useState([]) // 全店同事的班(本週)
  const [managerStores, setManagerStores] = useState([])   // 主管可看的門市(>1 才顯示下拉;督導/店長多店/營運/admin)
  const [pickedStore, setPickedStore] = useState(null)     // 全店檢視選定門市 id(null=未載入)

  const weekDates = getWeekDates(weekOffset)
  const today = new Date().toISOString().slice(0, 10)

  useEffect(() => {
    if (!lineProfile?.lineUserId) return
    Promise.all([
      supabase.rpc('liff_list_shift_definitions', { p_line_user_id: lineProfile.lineUserId }),
      supabase.rpc('liff_list_holidays'),
    ]).then(([sd, hd]) => {
      setShiftDefs(Array.isArray(sd.data) ? sd.data : [])
      const hMap = {}
      ;(Array.isArray(hd.data) ? hd.data : []).forEach(h => { hMap[h.date] = h.name })
      setHolidays(hMap)
      setLoading(false)
    })
  }, [lineProfile])

  useEffect(() => {
    if (!lineProfile?.lineUserId) return
    supabase.rpc('liff_list_schedules', { p_line_user_id: lineProfile.lineUserId, p_month: null })
      .then(({ data }) => {
        const all = Array.isArray(data) ? data : []
        // client-side filter 本週範圍（避免 RPC 多傳參數）
        setSchedules(all.filter(s => s.date >= weekDates[0] && s.date <= weekDates[6]))
      })
  }, [lineProfile, weekOffset]) // eslint-disable-line react-hooks/exhaustive-deps

  // 主管可看的門市清單（給全店檢視的門市下拉；督導課/店長多店/營運/admin）
  useEffect(() => {
    if (!lineProfile?.lineUserId) return
    supabase.rpc('liff_manager_view_stores', { p_line_user_id: lineProfile.lineUserId })
      .then(({ data }) => {
        const list = Array.isArray(data) ? data : []
        setManagerStores(list)
        setPickedStore(prev => prev ?? (list[0]?.id ?? null))  // 預設自己店（排最前）
      })
  }, [lineProfile])

  // 全店檢視：撈「選定門市」本週的班（僅在切到「全店」且門市已定時撈）
  useEffect(() => {
    if (!lineProfile?.lineUserId || viewMode !== 'store' || !pickedStore) return
    supabase.rpc('liff_view_store_schedule', { p_line_user_id: lineProfile.lineUserId, p_store_id: pickedStore, p_start: weekDates[0], p_end: weekDates[6] })
      .then(({ data }) => setStoreSchedules(Array.isArray(data) ? data : []))
  }, [lineProfile, weekOffset, viewMode, pickedStore]) // eslint-disable-line react-hooks/exhaustive-deps

  const getShift = (date) => schedules.find(s => s.date === date)?.shift || null
  const getShiftDef = (name) => shiftDefs.find(s => s.name === name)
  const getShiftColor = (name) => {
    if (name === '休') return { bg: 'var(--card)', color: 'var(--t3)', border: 'var(--border)' }
    const def = getShiftDef(name)
    return { bg: (def?.color || '#22d3ee') + '15', color: def?.color || 'var(--cyan)', border: (def?.color || '#22d3ee') + '40' }
  }

  // Stats — 認新標籤(休息/例假/特休…),休假不算上班;週時數用實際班別淨工時
  const ABSENCE = new Set(['例假', '休息', '休', '補休', '特休', '病', '會議', '產', '事', '國定假'])
  const REST = new Set(['例假', '休息', '休'])
  const segHours = (start, end, restMin) => {
    if (!start || !end) return 0
    const [sh, sm] = String(start).split(':').map(Number)
    const [eh, em] = String(end).split(':').map(Number)
    let m = (eh * 60 + em) - (sh * 60 + sm)
    if (m <= 0) m += 1440
    const brk = restMin != null ? restMin : (m >= 540 ? 60 : m >= 300 ? 30 : 0)  // 手動休息優先,否則階梯公式
    return Math.max(0, (m - brk) / 60)
  }
  const netOf = (s) => segHours(s.actual_start, s.actual_end, s.rest_minutes) + segHours(s.actual_start_2, s.actual_end_2, null)
  const workDays = weekDates.filter(d => { const s = getShift(d); return s && !ABSENCE.has(s) }).length
  const restDays = weekDates.filter(d => REST.has(getShift(d))).length
  const weekHours = Math.round(schedules.reduce((sum, s) => sum + netOf(s), 0) * 10) / 10

  if (loading) return <div className="page"><div className="empty"><div className="spinner" style={{ margin: '0 auto' }} /></div></div>

  return (
    <div className="page">
      <button className="back-btn" onClick={() => navigate('/')}><ChevronLeft size={16} /> 首頁</button>
      <div className="header">
        <div className="header-title">📅 我的班表</div>
      </div>

      {/* 我的 / 全店 切換 */}
      <div style={{ display: 'flex', gap: 6, justifyContent: 'center', marginBottom: 12 }}>
        {[{ v: 'mine', l: '我的班表' }, { v: 'store', l: '全店班表' }].map(t => (
          <button key={t.v} onClick={() => setViewMode(t.v)} style={{
            padding: '7px 18px', borderRadius: 999, fontSize: 13, fontWeight: 700, cursor: 'pointer',
            border: viewMode === t.v ? '1.5px solid var(--cyan)' : '1px solid var(--border2)',
            background: viewMode === t.v ? 'rgba(34,211,238,0.12)' : 'var(--card)',
            color: viewMode === t.v ? 'var(--cyan)' : 'var(--t2)',
          }}>{t.l}</button>
        ))}
      </div>

      {/* 門市下拉（全店模式 + 主管可看多店才顯示：督導/資深店長/營運/admin）*/}
      {viewMode === 'store' && managerStores.length > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12 }}>
          <select value={pickedStore ?? ''} onChange={e => setPickedStore(Number(e.target.value))}
            style={{ padding: '7px 14px', borderRadius: 8, border: '1px solid var(--border2)', background: 'var(--card)', color: 'var(--t1)', fontSize: 13, fontWeight: 600, cursor: 'pointer', minWidth: 160 }}>
            {managerStores.map(s => <option key={s.id} value={s.id}>🏢 {s.name}</option>)}
          </select>
        </div>
      )}

      {/* Week nav */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16, marginBottom: 16 }}>
        <button onClick={() => setWeekOffset(w => w - 1)} style={{
          width: 36, height: 36, borderRadius: '50%', border: '1px solid var(--border2)',
          background: 'var(--card)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--t2)',
        }}><ChevronLeft size={18} /></button>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 15, fontWeight: 700 }}>{weekDates[0].slice(5)} ~ {weekDates[6].slice(5)}</div>
          <div style={{ fontSize: 11, color: 'var(--t3)' }}>{weekOffset === 0 ? '本週' : weekOffset > 0 ? `${weekOffset} 週後` : `${-weekOffset} 週前`}</div>
        </div>
        <button onClick={() => setWeekOffset(w => w + 1)} style={{
          width: 36, height: 36, borderRadius: '50%', border: '1px solid var(--border2)',
          background: 'var(--card)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--t2)',
        }}><ChevronRight size={18} /></button>
      </div>

      {/* Quick stats（僅個人檢視）*/}
      {viewMode === 'mine' && (
      <div className="stat-row" style={{ marginBottom: 16 }}>
        <div className="stat-box">
          <div className="stat-num" style={{ color: 'var(--cyan)' }}>{workDays}</div>
          <div className="stat-label">上班</div>
        </div>
        <div className="stat-box">
          <div className="stat-num" style={{ color: 'var(--green)' }}>{restDays}</div>
          <div className="stat-label">休息</div>
        </div>
        <div className="stat-box">
          <div className="stat-num" style={{ color: weekHours > 40 ? 'var(--red)' : 'var(--t2)' }}>{weekHours}h</div>
          <div className="stat-label">週時數</div>
        </div>
      </div>
      )}

      {/* Schedule cards（我的）*/}
      {viewMode === 'mine' && weekDates.map((date, i) => {
        const shift = getShift(date)
        const isToday = date === today
        const isHoliday = holidays[date]
        const def = shift && shift !== '休' ? getShiftDef(shift) : null
        const colors = shift ? getShiftColor(shift) : { bg: 'var(--card)', color: 'var(--t3)', border: 'var(--border)' }

        return (
          <div key={date} style={{
            display: 'flex', alignItems: 'stretch', gap: 12, marginBottom: 8,
            padding: '14px 16px', borderRadius: 14,
            background: isToday ? 'rgba(34,211,238,0.06)' : 'var(--card)',
            border: `1.5px solid ${isToday ? 'rgba(34,211,238,0.3)' : 'var(--border)'}`,
          }}>
            {/* Day column */}
            <div style={{ width: 48, textAlign: 'center', flexShrink: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: i >= 5 ? 'var(--red)' : 'var(--t2)' }}>
                週{DAY_LABELS[i]}
              </div>
              <div style={{ fontSize: 20, fontWeight: 800, color: isToday ? 'var(--cyan)' : 'var(--t1)' }}>
                {date.slice(8)}
              </div>
              {isToday && <div style={{ fontSize: 9, color: 'var(--cyan)', fontWeight: 700 }}>今天</div>}
            </div>

            {/* Shift info */}
            <div style={{ flex: 1 }}>
              {shift ? (
                <div style={{
                  padding: '10px 14px', borderRadius: 10,
                  background: colors.bg, border: `1px solid ${colors.border}`,
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ fontSize: 16, fontWeight: 800, color: colors.color }}>{shift}</div>
                    {shift !== '休' && date >= today && (
                      <button onClick={() => setSwapModal({ date, myShift: shift })} style={{
                        background: 'var(--purple-dim)', color: 'var(--purple)', border: 'none',
                        padding: '4px 10px', borderRadius: 8, fontSize: 11, fontWeight: 700,
                        cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4,
                      }}>
                        <Repeat size={11} /> 換班
                      </button>
                    )}
                  </div>
                  {def && (
                    <div style={{ fontSize: 12, color: 'var(--t3)', marginTop: 4 }}>
                      {def.start_time?.slice(0, 5)} ~ {def.end_time?.slice(0, 5)}
                      <span style={{ marginLeft: 8 }}>休息 {def.break_minutes || 60} 分鐘</span>
                    </div>
                  )}
                  {shift === '休' && <div style={{ fontSize: 12, color: 'var(--t3)' }}>休息日</div>}
                </div>
              ) : (
                <div style={{ padding: '10px 14px', borderRadius: 10, background: 'var(--card)', border: '1px dashed var(--border2)' }}>
                  <div style={{ fontSize: 13, color: 'var(--t3)' }}>尚未排班</div>
                </div>
              )}
              {isHoliday && (
                <div style={{ fontSize: 11, color: 'var(--red)', marginTop: 4, fontWeight: 600 }}>
                  🎌 {isHoliday}
                </div>
              )}
            </div>
          </div>
        )
      })}

      {/* Schedule cards（全店）*/}
      {viewMode === 'store' && weekDates.map((date, i) => {
        const rows = storeSchedules.filter(s => s.date === date)
          .sort((a, b) => (a.actual_start || 'z').localeCompare(b.actual_start || 'z') || (a.employee || '').localeCompare(b.employee || ''))
        const isToday = date === today
        const isHoliday = holidays[date]
        return (
          <div key={date} style={{
            display: 'flex', alignItems: 'stretch', gap: 12, marginBottom: 8,
            padding: '14px 16px', borderRadius: 14,
            background: isToday ? 'rgba(34,211,238,0.06)' : 'var(--card)',
            border: `1.5px solid ${isToday ? 'rgba(34,211,238,0.3)' : 'var(--border)'}`,
          }}>
            <div style={{ width: 48, textAlign: 'center', flexShrink: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: i >= 5 ? 'var(--red)' : 'var(--t2)' }}>週{DAY_LABELS[i]}</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: isToday ? 'var(--cyan)' : 'var(--t1)' }}>{date.slice(8)}</div>
              {isToday && <div style={{ fontSize: 9, color: 'var(--cyan)', fontWeight: 700 }}>今天</div>}
              {isHoliday && <div style={{ fontSize: 9, color: 'var(--red)', fontWeight: 600, marginTop: 2 }}>🎌</div>}
            </div>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 5 }}>
              {rows.length === 0 ? (
                <div style={{ padding: '8px 12px', borderRadius: 10, background: 'var(--card)', border: '1px dashed var(--border2)', fontSize: 13, color: 'var(--t3)' }}>尚未排班</div>
              ) : rows.map(s => {
                const c = getShiftColor(s.shift)
                const def = s.shift && s.shift !== '休' ? getShiftDef(s.shift) : null
                const timeStr = (s.actual_start && s.actual_end)
                  ? `${String(s.actual_start).slice(0, 5)}~${String(s.actual_end).slice(0, 5)}`
                  : (def ? `${def.start_time?.slice(0, 5)}~${def.end_time?.slice(0, 5)}` : '')
                return (
                  <div key={s.id ?? (s.employee + s.shift)} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
                    padding: '6px 10px', borderRadius: 8, background: c.bg, border: `1px solid ${c.border}`,
                  }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--t1)' }}>{s.employee || '—'}</span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: c.color, textAlign: 'right' }}>
                      {ABSENCE.has(s.shift) ? s.shift : (timeStr || s.shift)}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}

      {swapModal && (
        <SwapModal modal={swapModal} lineUserId={lineProfile.lineUserId}
          onClose={() => setSwapModal(null)}
          onDone={() => setSwapModal(null)} />
      )}
    </div>
  )
}

function SwapModal({ modal, lineUserId, onClose, onDone }) {
  const [candidates, setCandidates] = useState([])
  const [loading, setLoading] = useState(true)
  const [targetId, setTargetId] = useState(null)
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    supabase.rpc('liff_list_swap_candidates', { p_line_user_id: lineUserId, p_date: modal.date })
      .then(({ data }) => {
        setCandidates(Array.isArray(data) ? data : [])
        setLoading(false)
      })
  }, [lineUserId, modal.date])

  const handleSubmit = async () => {
    if (!targetId) return
    const target = candidates.find(c => c.emp_id === targetId)
    setSubmitting(true)
    const { data: result, error } = await supabase.rpc('liff_request_shift_swap', {
      p_line_user_id: lineUserId,
      p_payload: { target_id: targetId, swap_date: modal.date, reason: reason.trim() || null },
    })
    setSubmitting(false)
    if (error) { alert('系統錯誤：' + error.message); return }
    if (!result?.ok) {
      const msg = {
        TARGET_NOT_FOUND: '找不到對象', CANNOT_SWAP_WITH_SELF: '不能跟自己換',
        INVALID_DATE: '日期無效（需為今日之後）', REQUESTER_NO_SHIFT: '你當天沒班',
        TARGET_NO_SHIFT: '對方當天沒班', DIFFERENT_STORE: '不同門市，無法換班',
        DUPLICATE_PENDING_SWAP: '已有未結案的換班申請',
      }
      alert(msg[result?.error] || `失敗：${result?.error}`)
      return
    }
    notifyShiftSwapEvent({
      event: 'requested',
      swap: {
        target_emp_id: targetId, target: target?.name,
        requester: '你', requester_shift: modal.myShift, target_shift: target?.shift,
        swap_date: modal.date,
      },
    }).catch(err => console.warn('notify failed', err))
    alert(`✅ 換班申請已送出，等 ${target?.name} 回覆`)
    onDone()
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 1000,
      display: 'flex', alignItems: 'flex-end',
    }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        width: '100%', maxHeight: '90vh', background: 'var(--bg)',
        borderTopLeftRadius: 18, borderTopRightRadius: 18,
        padding: 20, overflowY: 'auto',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 800 }}>申請換班</div>
            <div style={{ fontSize: 12, color: 'var(--t3)', marginTop: 2 }}>
              {modal.date} · 你的班 <span style={{ fontFamily: 'monospace', color: 'var(--cyan)' }}>{modal.myShift}</span>
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--t3)' }}>
            <X size={22} />
          </button>
        </div>

        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8, color: 'var(--t2)' }}>
          選擇要換的同事（同店、當天有班）
        </div>
        {loading ? (
          <div style={{ textAlign: 'center', padding: 20 }}><div className="spinner" style={{ margin: '0 auto' }} /></div>
        ) : candidates.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 20, color: 'var(--t3)', fontSize: 13 }}>
            當天沒有同店、有班的同事可換
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 }}>
            {candidates.map(c => (
              <button key={c.emp_id} onClick={() => setTargetId(c.emp_id)} style={{
                padding: '12px 14px', borderRadius: 10, cursor: 'pointer', textAlign: 'left',
                border: targetId === c.emp_id ? '2px solid var(--purple)' : '1.5px solid var(--border2)',
                background: targetId === c.emp_id ? 'var(--purple-dim)' : 'var(--card)',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              }}>
                <span style={{ fontSize: 14, fontWeight: 700 }}>{c.name}</span>
                <span style={{ fontFamily: 'monospace', fontSize: 13, color: 'var(--cyan)' }}>{c.shift}</span>
              </button>
            ))}
          </div>
        )}

        <div style={{ marginBottom: 14 }}>
          <label style={{ fontSize: 12, color: 'var(--t3)', display: 'block', marginBottom: 4 }}>理由（選填）</label>
          <textarea value={reason} onChange={e => setReason(e.target.value)}
            placeholder="例：那天家裡有事..."
            style={{
              width: '100%', minHeight: 60, padding: '10px 12px', borderRadius: 10,
              border: '1px solid var(--border2)', background: 'var(--card)', color: 'var(--t1)',
              fontSize: 13, fontFamily: 'inherit', resize: 'vertical',
            }} />
        </div>

        <button disabled={!targetId || submitting} onClick={handleSubmit} style={{
          width: '100%', padding: '14px', borderRadius: 12, border: 'none',
          background: targetId ? 'var(--purple)' : 'var(--border2)',
          color: '#fff', fontSize: 15, fontWeight: 800, cursor: targetId ? 'pointer' : 'not-allowed',
          opacity: submitting ? 0.6 : 1,
        }}>
          {submitting ? '送出中...' : '送出換班申請'}
        </button>
      </div>
    </div>
  )
}
