import { useState, useEffect } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'

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
  const { employee } = useAuth()
  const navigate = useNavigate()
  const [weekOffset, setWeekOffset] = useState(0)
  const [schedules, setSchedules] = useState([])
  const [holidays, setHolidays] = useState({}) // { '2026-04-04': '兒童節' }
  const [shiftDefs, setShiftDefs] = useState([])
  const [loading, setLoading] = useState(true)

  const weekDates = getWeekDates(weekOffset)
  const today = new Date().toISOString().slice(0, 10)

  useEffect(() => {
    Promise.all([
      supabase.from('shift_definitions').select('*').order('sort_order'),
      supabase.from('holidays').select('date, name'),
    ]).then(([sd, hd]) => {
      setShiftDefs(sd.data || [])
      const hMap = {}
      ;(hd.data || []).forEach(h => { hMap[h.date] = h.name })
      setHolidays(hMap)
      setLoading(false)
    })
  }, [])

  useEffect(() => {
    if (!employee) return
    supabase.from('schedules').select('*')
      .eq('employee', employee.name)
      .gte('date', weekDates[0])
      .lte('date', weekDates[6])
      .then(({ data }) => setSchedules(data || []))
  }, [employee, weekOffset])

  const getShift = (date) => schedules.find(s => s.date === date)?.shift || null
  const getShiftDef = (name) => shiftDefs.find(s => s.name === name)
  const getShiftColor = (name) => {
    if (name === '休') return { bg: 'var(--card)', color: 'var(--t3)', border: 'var(--border)' }
    const def = getShiftDef(name)
    return { bg: (def?.color || '#22d3ee') + '15', color: def?.color || 'var(--cyan)', border: (def?.color || '#22d3ee') + '40' }
  }

  // Stats
  const workDays = weekDates.filter(d => { const s = getShift(d); return s && s !== '休' }).length
  const restDays = weekDates.filter(d => getShift(d) === '休').length
  const unscheduled = weekDates.filter(d => !getShift(d)).length

  if (loading) return <div className="page"><div className="empty"><div className="spinner" style={{ margin: '0 auto' }} /></div></div>

  return (
    <div className="page">
      <button className="back-btn" onClick={() => navigate('/')}><ChevronLeft size={16} /> 首頁</button>
      <div className="header">
        <div className="header-title">📅 我的班表</div>
      </div>

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

      {/* Quick stats */}
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
          <div className="stat-num" style={{ color: workDays * 8 > 40 ? 'var(--red)' : 'var(--t2)' }}>{workDays * 8}h</div>
          <div className="stat-label">週時數</div>
        </div>
      </div>

      {/* Schedule cards */}
      {weekDates.map((date, i) => {
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
                  <div style={{ fontSize: 16, fontWeight: 800, color: colors.color }}>{shift}</div>
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
    </div>
  )
}
