import { useState, useEffect, useMemo } from 'react'
import { ChevronLeft, ChevronRight, Clock, MapPin, Wifi, X } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'

const STATUS_STYLE = {
  '正常': { bg: 'var(--green-dim)', color: 'var(--green)', dot: 'var(--green)' },
  '外出': { bg: 'var(--green-dim)', color: 'var(--green)', dot: 'var(--green)' },
  '遲到': { bg: 'rgba(251,146,60,0.15)', color: 'var(--orange)', dot: 'var(--orange)' },
  '請假': { bg: 'var(--blue-dim)',   color: 'var(--blue)',  dot: 'var(--blue)' },
  '加班': { bg: 'rgba(251,146,60,0.15)', color: 'var(--orange)', dot: 'var(--orange)' },
}

function getMonthGrid(year, month) {
  // month 1-12 → 回 7 列 × N 行 格子（缺位 null）
  const first = new Date(year, month - 1, 1)
  const last  = new Date(year, month, 0)
  const startWeekday = (first.getDay() + 6) % 7  // 週一=0
  const cells = []
  for (let i = 0; i < startWeekday; i++) cells.push(null)
  for (let d = 1; d <= last.getDate(); d++) {
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    cells.push({ d, dateStr })
  }
  while (cells.length % 7 !== 0) cells.push(null)
  return cells
}

export default function AttendanceHistory() {
  const { lineProfile } = useAuth()
  const today = new Date()
  const [year, setYear] = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth() + 1)
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedRecord, setSelectedRecord] = useState(null)

  const ym = `${year}-${String(month).padStart(2, '0')}`
  const lineUserId = lineProfile?.lineUserId

  useEffect(() => {
    if (!lineUserId) return
    setLoading(true)
    supabase
      .rpc('liff_get_my_attendance_month', { p_line_user_id: lineUserId, p_year_month: ym })
      .then(({ data }) => {
        setRecords(Array.isArray(data) ? data : [])
        setLoading(false)
      })
  }, [lineUserId, ym])

  // dateStr → record map
  const recordByDate = useMemo(() => {
    const m = {}
    for (const r of records) m[r.date] = r
    return m
  }, [records])

  const stats = useMemo(() => {
    const clockedIn = records.filter(r => r.clock_in).length
    const late = records.filter(r => r.is_late).length
    const totalHours = records.reduce((s, r) => s + Number(r.total_hours || 0), 0)
    return { clockedIn, late, totalHours }
  }, [records])

  const cells = useMemo(() => getMonthGrid(year, month), [year, month])
  const todayStr = today.toISOString().slice(0, 10)

  const goPrev = () => {
    if (month === 1) { setMonth(12); setYear(year - 1) }
    else setMonth(month - 1)
  }
  const goNext = () => {
    if (month === 12) { setMonth(1); setYear(year + 1) }
    else setMonth(month + 1)
  }

  return (
    <div className="page">
      <div className="header">
        <div>
          <div className="header-title">打卡紀錄</div>
          <div className="header-sub">點任一天查看明細</div>
        </div>
      </div>

      {/* 月份切換 */}
      <div className="card" style={{ marginBottom: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 14px' }}>
        <button onClick={goPrev} style={{ background: 'none', border: 'none', color: 'var(--cyan)', cursor: 'pointer', padding: 4 }}>
          <ChevronLeft size={20} />
        </button>
        <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--t1)' }}>
          {year} 年 {month} 月
        </div>
        <button onClick={goNext} style={{ background: 'none', border: 'none', color: 'var(--cyan)', cursor: 'pointer', padding: 4 }}>
          <ChevronRight size={20} />
        </button>
      </div>

      {/* 統計 */}
      <div className="card" style={{ marginBottom: 10, padding: '10px 14px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, textAlign: 'center' }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--cyan)' }}>{stats.clockedIn}</div>
            <div style={{ fontSize: 10, color: 'var(--t3)', marginTop: 2 }}>出勤天數</div>
          </div>
          <div>
            <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--green)' }}>{stats.totalHours.toFixed(1)}</div>
            <div style={{ fontSize: 10, color: 'var(--t3)', marginTop: 2 }}>總時數</div>
          </div>
          <div>
            <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--orange)' }}>{stats.late}</div>
            <div style={{ fontSize: 10, color: 'var(--t3)', marginTop: 2 }}>遲到</div>
          </div>
        </div>
      </div>

      {/* 月曆 */}
      <div className="card" style={{ padding: 10 }}>
        {/* 星期表頭 */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, marginBottom: 6 }}>
          {['一', '二', '三', '四', '五', '六', '日'].map((w, i) => (
            <div key={w} style={{
              textAlign: 'center', fontSize: 10, fontWeight: 700,
              color: i >= 4 ? 'var(--orange)' : 'var(--t3)', padding: '4px 0',
            }}>
              {w}
            </div>
          ))}
        </div>

        {/* 日期格 */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
          {loading ? (
            <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: 20, color: 'var(--t3)' }}>載入中…</div>
          ) : cells.map((cell, i) => {
            if (!cell) return <div key={`empty-${i}`} />
            const r = recordByDate[cell.dateStr]
            const isToday = cell.dateStr === todayStr
            const isWeekend = i % 7 >= 5
            const sty = r?.status ? (STATUS_STYLE[r.status] || null) : null
            return (
              <button
                key={cell.dateStr}
                onClick={() => r && setSelectedRecord(r)}
                disabled={!r}
                style={{
                  aspectRatio: '1', padding: 0,
                  background: r ? (sty?.bg || 'var(--card-hover)') : 'transparent',
                  border: isToday ? '2px solid var(--cyan)' : '1px solid var(--border)',
                  borderRadius: 8,
                  cursor: r ? 'pointer' : 'default',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                  gap: 2, transition: 'all 0.15s',
                  color: isWeekend ? 'var(--orange)' : 'var(--t1)',
                }}
              >
                <div style={{ fontSize: 13, fontWeight: 700 }}>{cell.d}</div>
                {r ? (
                  <div style={{ fontSize: 9, fontWeight: 600, color: sty?.color || 'var(--t3)' }}>
                    {r.status || '?'}
                  </div>
                ) : (
                  <div style={{ width: 4, height: 4, borderRadius: '50%', background: 'var(--border)' }} />
                )}
              </button>
            )
          })}
        </div>
      </div>

      <div style={{ height: 40 }} />

      {/* 詳細 modal */}
      {selectedRecord && (
        <div
          onClick={() => setSelectedRecord(null)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 100,
            display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              width: '100%', maxWidth: 480,
              background: 'var(--bg)', borderRadius: '16px 16px 0 0',
              padding: '16px 20px 24px', maxHeight: '80vh', overflowY: 'auto',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <div>
                <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--t1)' }}>{selectedRecord.date}</div>
                <div style={{ fontSize: 11, color: 'var(--t3)' }}>
                  {new Date(selectedRecord.date).toLocaleDateString('zh-TW', { weekday: 'long' })}
                </div>
              </div>
              <button onClick={() => setSelectedRecord(null)} style={{ background: 'none', border: 'none', color: 'var(--t3)', cursor: 'pointer' }}>
                <X size={20} />
              </button>
            </div>

            <div style={{
              padding: '10px 14px', borderRadius: 10, marginBottom: 10,
              background: (STATUS_STYLE[selectedRecord.status] || { bg: 'var(--card)' }).bg,
              color: (STATUS_STYLE[selectedRecord.status] || { color: 'var(--t1)' }).color,
              fontWeight: 700, textAlign: 'center',
            }}>
              {selectedRecord.status || '—'}
            </div>

            <div style={{ background: 'var(--card)', padding: '12px 14px', borderRadius: 10, marginBottom: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <Clock size={14} style={{ color: 'var(--cyan)' }} />
                <span style={{ fontSize: 13, fontFamily: 'monospace', fontWeight: 700, color: 'var(--t1)' }}>
                  {selectedRecord.clock_in || '—'} → {selectedRecord.clock_out || '—'}
                </span>
                {selectedRecord.total_hours > 0 && (
                  <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--t2)' }}>
                    {Number(selectedRecord.total_hours).toFixed(1)} 小時
                  </span>
                )}
              </div>
              {selectedRecord.clock_in_mode === 'outing' && (
                <div style={{ fontSize: 11, color: 'var(--green)', marginBottom: 4 }}>✈️ 外出打卡</div>
              )}
              {selectedRecord.is_late && selectedRecord.late_minutes > 0 && (
                <div style={{ fontSize: 11, color: 'var(--orange)' }}>⏰ 遲到 {selectedRecord.late_minutes} 分鐘</div>
              )}
            </div>

            {(selectedRecord.clock_in_location || selectedRecord.clock_in_ip) && (
              <div style={{ background: 'var(--card)', padding: '12px 14px', borderRadius: 10, fontSize: 12, color: 'var(--t2)' }}>
                {selectedRecord.clock_in_location && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                    <MapPin size={12} /> {selectedRecord.clock_in_location}
                  </div>
                )}
                {selectedRecord.clock_in_ip && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Wifi size={12} /> {selectedRecord.clock_in_ip}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
