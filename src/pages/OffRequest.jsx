import { useState, useEffect } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'

const DAY_LABELS = ['一', '二', '三', '四', '五', '六', '日']

function getMonthDates(year, month) {
  const firstDay = new Date(year, month, 1)
  const lastDay = new Date(year, month + 1, 0)

  // Monday=0 based offset for first day
  let startDow = firstDay.getDay() || 7 // 1=Mon..7=Sun
  startDow -= 1 // 0=Mon..6=Sun

  const dates = []

  // Padding days from previous month
  for (let i = startDow - 1; i >= 0; i--) {
    const d = new Date(year, month, -i)
    dates.push({ date: d.toISOString().slice(0, 10), currentMonth: false })
  }

  // Current month days
  for (let i = 1; i <= lastDay.getDate(); i++) {
    const d = new Date(year, month, i)
    dates.push({ date: d.toISOString().slice(0, 10), currentMonth: true })
  }

  // Padding days for remaining cells (fill to complete week rows)
  while (dates.length % 7 !== 0) {
    const d = new Date(year, month + 1, dates.length - (startDow + lastDay.getDate()) + 1)
    dates.push({ date: d.toISOString().slice(0, 10), currentMonth: false })
  }

  return dates
}

export default function OffRequest() {
  const { employee } = useAuth()
  const navigate = useNavigate()

  const now = new Date()
  const [viewYear, setViewYear] = useState(now.getFullYear())
  const [viewMonth, setViewMonth] = useState(now.getMonth())
  const [myRequests, setMyRequests] = useState([])
  const [mySchedules, setMySchedules] = useState([])
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')

  const monthDates = getMonthDates(viewYear, viewMonth)
  const monthStart = monthDates[0].date
  const monthEnd = monthDates[monthDates.length - 1].date
  const todayStr = now.toISOString().slice(0, 10)

  const monthLabel = `${viewYear} 年 ${viewMonth + 1} 月`

  const prevMonth = () => {
    if (viewMonth === 0) { setViewYear(y => y - 1); setViewMonth(11) }
    else setViewMonth(m => m - 1)
  }
  const nextMonth = () => {
    if (viewMonth === 11) { setViewYear(y => y + 1); setViewMonth(0) }
    else setViewMonth(m => m + 1)
  }

  useEffect(() => {
    if (!employee) return
    Promise.all([
      supabase.from('off_requests').select('*').eq('employee', employee.name).gte('date', monthStart).lte('date', monthEnd),
      supabase.from('schedules').select('*').eq('employee', employee.name).gte('date', monthStart).lte('date', monthEnd),
    ]).then(([o, s]) => {
      setMyRequests(o.data || [])
      setMySchedules(s.data || [])
    })
  }, [employee, monthStart, monthEnd])

  const isRequested = (date) => myRequests.some(r => r.date === date)
  const getSchedule = (date) => mySchedules.find(s => s.date === date)?.shift || ''

  const toggleDay = async (date) => {
    setSaving(true)
    if (isRequested(date)) {
      await supabase.from('off_requests').delete().eq('employee', employee.name).eq('date', date)
      setMyRequests(prev => prev.filter(r => r.date !== date))
    } else {
      const { data } = await supabase.from('off_requests').insert({
        employee: employee.name,
        date,
        status: '待確認',
      }).select().single()
      if (data) setMyRequests(prev => [...prev, data])
    }
    setSaving(false)
  }

  const totalRequested = myRequests.filter(r => {
    const d = new Date(r.date)
    return d.getFullYear() === viewYear && d.getMonth() === viewMonth
  }).length

  return (
    <div className="page">
      <button className="back-btn" onClick={() => navigate('/')}><ChevronLeft size={16} /> 首頁</button>
      <div className="header">
        <div className="header-title">📅 排休申請</div>
      </div>

      {/* Month Nav */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <button onClick={prevMonth} style={{
          background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10,
          padding: '8px 12px', cursor: 'pointer', color: 'var(--t2)',
        }}><ChevronLeft size={18} /></button>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 17, fontWeight: 800 }}>{monthLabel}</div>
        </div>
        <button onClick={nextMonth} style={{
          background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10,
          padding: '8px 12px', cursor: 'pointer', color: 'var(--t2)',
        }}><ChevronRight size={18} /></button>
      </div>

      <div style={{ fontSize: 12, color: 'var(--t3)', textAlign: 'center', marginBottom: 12 }}>
        點擊日期選擇希望休假的天（本月已選 <span style={{ color: 'var(--orange)', fontWeight: 700 }}>{totalRequested}</span> 天）
      </div>

      {/* Day Headers */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, marginBottom: 4 }}>
        {DAY_LABELS.map((d, i) => (
          <div key={d} style={{
            textAlign: 'center', fontSize: 11, fontWeight: 700,
            color: i >= 5 ? 'var(--orange)' : 'var(--t3)',
            padding: '6px 0',
          }}>{d}</div>
        ))}
      </div>

      {/* Calendar Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, marginBottom: 20 }}>
        {monthDates.map(({ date, currentMonth }) => {
          const requested = isRequested(date)
          const schedule = getSchedule(date)
          const isRest = schedule === '休'
          const isPast = date < todayStr
          const isToday = date === todayStr
          const dayNum = parseInt(date.slice(8))
          const dow = new Date(date).getDay()
          const isWeekend = dow === 0 || dow === 6

          return (
            <button
              key={date}
              disabled={isPast || !currentMonth || saving}
              onClick={() => !isPast && currentMonth && toggleDay(date)}
              style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                gap: 2, padding: '10px 2px', borderRadius: 12, cursor: (isPast || !currentMonth) ? 'default' : 'pointer',
                background: requested
                  ? 'var(--orange-dim)'
                  : isToday
                    ? 'var(--cyan-dim)'
                    : isRest
                      ? 'var(--green-dim)'
                      : 'var(--card)',
                border: requested
                  ? '2px solid var(--orange)'
                  : isToday
                    ? '2px solid var(--cyan)'
                    : '1px solid var(--border)',
                opacity: !currentMonth ? 0.25 : isPast ? 0.4 : 1,
                transition: 'all 0.15s',
                minHeight: 56,
              }}
            >
              <div style={{
                fontSize: 15, fontWeight: 800,
                color: requested ? 'var(--orange)' : isToday ? 'var(--cyan)' : isWeekend && currentMonth ? 'var(--orange)' : 'var(--t1)',
              }}>
                {dayNum}
              </div>
              <div style={{
                fontSize: 9, fontWeight: 600,
                color: requested ? 'var(--orange)' : isRest ? 'var(--green)' : schedule ? 'var(--cyan)' : 'transparent',
              }}>
                {requested ? '希望休' : schedule || '-'}
              </div>
            </button>
          )
        })}
      </div>

      {/* Legend */}
      <div style={{
        display: 'flex', gap: 16, justifyContent: 'center', marginBottom: 16,
        fontSize: 11, color: 'var(--t3)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <div style={{ width: 10, height: 10, borderRadius: 3, background: 'var(--orange-dim)', border: '1.5px solid var(--orange)' }} />
          希望休
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <div style={{ width: 10, height: 10, borderRadius: 3, background: 'var(--green-dim)' }} />
          已排休
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <div style={{ width: 10, height: 10, borderRadius: 3, background: 'var(--cyan-dim)', border: '1.5px solid var(--cyan)' }} />
          今天
        </div>
      </div>

      {/* Message */}
      {msg && (
        <div style={{
          textAlign: 'center', padding: '10px', borderRadius: 10,
          background: 'var(--green-dim)', color: 'var(--green)',
          fontSize: 14, fontWeight: 600, marginTop: 12,
        }}>{msg}</div>
      )}

      <div style={{ fontSize: 11, color: 'var(--t3)', textAlign: 'center', marginTop: 12 }}>
        排休申請送出後，管理員會在 AI 自動排班時優先安排
      </div>
    </div>
  )
}
