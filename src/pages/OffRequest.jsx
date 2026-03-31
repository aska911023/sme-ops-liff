import { useState, useEffect } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'

const DAY_LABELS = ['一', '二', '三', '四', '五', '六', '日']

function getWeekDates(offset = 0) {
  const now = new Date()
  const dayOfWeek = now.getDay() || 7
  const monday = new Date(now)
  monday.setDate(now.getDate() - dayOfWeek + 1 + offset * 7)
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday)
    d.setDate(monday.getDate() + i)
    return d.toISOString().slice(0, 10)
  })
}

export default function OffRequest() {
  const { employee } = useAuth()
  const navigate = useNavigate()
  const [weekOffset, setWeekOffset] = useState(1) // default next week
  const [myRequests, setMyRequests] = useState([])
  const [mySchedules, setMySchedules] = useState([])
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')

  const weekDates = getWeekDates(weekOffset)
  const weekStart = weekDates[0]
  const weekEnd = weekDates[6]

  useEffect(() => {
    if (!employee) return
    Promise.all([
      supabase.from('off_requests').select('*').eq('employee', employee.name).gte('date', weekStart).lte('date', weekEnd),
      supabase.from('schedules').select('*').eq('employee', employee.name).gte('date', weekStart).lte('date', weekEnd),
    ]).then(([o, s]) => {
      setMyRequests(o.data || [])
      setMySchedules(s.data || [])
    })
  }, [employee, weekStart])

  const isRequested = (date) => myRequests.some(r => r.date === date)
  const getSchedule = (date) => mySchedules.find(s => s.date === date)?.shift || ''

  const toggleDay = async (date) => {
    setSaving(true)
    if (isRequested(date)) {
      // Remove request
      await supabase.from('off_requests').delete().eq('employee', employee.name).eq('date', date)
      setMyRequests(prev => prev.filter(r => r.date !== date))
    } else {
      // Add request
      const { data } = await supabase.from('off_requests').insert({
        employee: employee.name,
        date,
        status: '待確認',
      }).select().single()
      if (data) setMyRequests(prev => [...prev, data])
    }
    setSaving(false)
  }

  const totalRequested = myRequests.length

  return (
    <div className="page">
      <button className="back-btn" onClick={() => navigate('/')}><ChevronLeft size={16} /> 首頁</button>
      <div className="header">
        <div className="header-title">📅 排休申請</div>
      </div>

      {/* Week Nav */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16, marginBottom: 20 }}>
        <button onClick={() => setWeekOffset(w => w - 1)} style={{
          background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10,
          padding: '8px 12px', cursor: 'pointer', color: 'var(--t2)',
        }}><ChevronLeft size={18} /></button>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 15, fontWeight: 700 }}>{weekStart.slice(5)} ~ {weekEnd.slice(5)}</div>
          <div style={{ fontSize: 11, color: 'var(--t3)' }}>{weekOffset === 0 ? '本週' : weekOffset === 1 ? '下週' : `${weekOffset > 0 ? '+' : ''}${weekOffset} 週`}</div>
        </div>
        <button onClick={() => setWeekOffset(w => w + 1)} style={{
          background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10,
          padding: '8px 12px', cursor: 'pointer', color: 'var(--t2)',
        }}><ChevronRight size={18} /></button>
      </div>

      <div style={{ fontSize: 12, color: 'var(--t3)', textAlign: 'center', marginBottom: 16 }}>
        點擊日期選擇希望休假的天（已選 {totalRequested} 天）
      </div>

      {/* Day Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6, marginBottom: 20 }}>
        {weekDates.map((date, i) => {
          const requested = isRequested(date)
          const schedule = getSchedule(date)
          const isRest = schedule === '休'
          const isPast = date < new Date().toISOString().slice(0, 10)
          return (
            <button
              key={date}
              disabled={isPast || saving}
              onClick={() => !isPast && toggleDay(date)}
              style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                padding: '14px 4px', borderRadius: 12, border: 'none', cursor: isPast ? 'default' : 'pointer',
                background: requested ? 'var(--orange-dim)' : isRest ? 'var(--green-dim)' : schedule ? 'var(--cyan-dim)' : 'var(--card)',
                border: requested ? '2px solid var(--orange)' : '2px solid transparent',
                opacity: isPast ? 0.4 : 1,
                transition: 'all 0.15s',
              }}
            >
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--t2)' }}>週{DAY_LABELS[i]}</div>
              <div style={{ fontSize: 16, fontWeight: 800, color: requested ? 'var(--orange)' : 'var(--t1)' }}>
                {date.slice(8)}
              </div>
              <div style={{ fontSize: 10, color: requested ? 'var(--orange)' : isRest ? 'var(--green)' : schedule ? 'var(--cyan)' : 'var(--t3)' }}>
                {requested ? '希望休' : schedule || '-'}
              </div>
            </button>
          )
        })}
      </div>

      {/* Current Schedule */}
      {mySchedules.length > 0 && (
        <div className="card">
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--t2)', marginBottom: 10 }}>本週已排班</div>
          {mySchedules.map(s => (
            <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border)', fontSize: 14 }}>
              <span style={{ color: 'var(--t2)' }}>{s.date} (週{DAY_LABELS[weekDates.indexOf(s.date)]})</span>
              <span style={{ fontWeight: 700, color: s.shift === '休' ? 'var(--green)' : 'var(--cyan)' }}>{s.shift}</span>
            </div>
          ))}
        </div>
      )}

      {/* Message */}
      {msg && (
        <div style={{
          textAlign: 'center', padding: '10px', borderRadius: 10,
          background: 'var(--green-dim)', color: 'var(--green)',
          fontSize: 14, fontWeight: 600, marginTop: 12,
        }}>{msg}</div>
      )}

      <div style={{ fontSize: 11, color: 'var(--t3)', textAlign: 'center', marginTop: 16 }}>
        排休申請送出後，管理員會在 AI 自動排班時優先安排
      </div>
    </div>
  )
}
