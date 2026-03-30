import { useState, useEffect } from 'react'
import { MapPin } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'

export default function ClockPage() {
  const { employee } = useAuth()
  const [time, setTime] = useState(new Date())
  const [todayRecord, setTodayRecord] = useState(null)
  const [loading, setLoading] = useState(false)
  const [location, setLocation] = useState(null)
  const [msg, setMsg] = useState('')

  const today = new Date().toISOString().slice(0, 10)

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    if (!employee) return
    supabase
      .from('attendance_records')
      .select('*')
      .eq('employee', employee.name)
      .eq('date', today)
      .maybeSingle()
      .then(({ data }) => setTodayRecord(data))

    // Get GPS
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        pos => setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        () => {}
      )
    }
  }, [employee])

  const handleClock = async (type) => {
    if (loading) return
    setLoading(true)
    const now = new Date().toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit', hour12: false })

    try {
      if (type === 'in') {
        const { data } = await supabase.from('attendance_records').insert({
          employee: employee.name,
          date: today,
          clock_in: now,
          status: now <= '09:00' ? '正常' : '遲到',
          location: location ? `${location.lat.toFixed(4)},${location.lng.toFixed(4)}` : null,
        }).select().single()
        if (data) { setTodayRecord(data); setMsg('上班打卡成功 ✓') }
      } else {
        const clockIn = todayRecord?.clock_in || '09:00'
        const hours = Math.max(0, Math.round((new Date(`2000-01-01T${now}`) - new Date(`2000-01-01T${clockIn}`)) / 3600000 * 10) / 10)
        const { data } = await supabase.from('attendance_records')
          .update({ clock_out: now, hours })
          .eq('id', todayRecord.id)
          .select().single()
        if (data) { setTodayRecord(data); setMsg('下班打卡成功 ✓') }
      }
    } catch (e) {
      setMsg('打卡失敗，請稍後再試')
    }
    setLoading(false)
    setTimeout(() => setMsg(''), 3000)
  }

  const clockedIn = !!todayRecord?.clock_in
  const clockedOut = !!todayRecord?.clock_out

  return (
    <div className="page">
      <div className="header">
        <div>
          <div className="header-title">打卡</div>
          <div className="header-sub">{today}</div>
        </div>
      </div>

      {/* Clock Display */}
      <div style={{ textAlign: 'center', margin: '20px 0 32px' }}>
        <div className="clock-display">
          {time.toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}
        </div>
        {location && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, marginTop: 8, fontSize: 12, color: 'var(--t3)' }}>
            <MapPin size={12} /> GPS 定位已取得
          </div>
        )}
      </div>

      {/* Clock Button */}
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 32 }}>
        {!clockedIn ? (
          <button className="clock-btn clock-in" onClick={() => handleClock('in')} disabled={loading}>
            <span style={{ fontSize: 28 }}>👆</span>
            上班打卡
          </button>
        ) : !clockedOut ? (
          <button className="clock-btn clock-out" onClick={() => handleClock('out')} disabled={loading}>
            <span style={{ fontSize: 28 }}>👋</span>
            下班打卡
          </button>
        ) : (
          <div style={{
            width: 140, height: 140, borderRadius: '50%',
            background: 'var(--green-dim)', border: '2px solid var(--green)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          }}>
            <span style={{ fontSize: 28 }}>✅</span>
            <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--green)', marginTop: 4 }}>已完成</span>
          </div>
        )}
      </div>

      {/* Message */}
      {msg && (
        <div style={{
          textAlign: 'center', padding: '10px', borderRadius: 10,
          background: 'var(--green-dim)', color: 'var(--green)',
          fontSize: 14, fontWeight: 600, marginBottom: 20,
        }}>{msg}</div>
      )}

      {/* Today Record */}
      <div className="card">
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--t2)', marginBottom: 12 }}>今日紀錄</div>
        <div className="info-row">
          <span className="info-label">上班打卡</span>
          <span className="info-value" style={{ color: clockedIn ? 'var(--green)' : 'var(--t3)' }}>
            {todayRecord?.clock_in || '--:--'}
          </span>
        </div>
        <div className="info-row">
          <span className="info-label">下班打卡</span>
          <span className="info-value" style={{ color: clockedOut ? 'var(--cyan)' : 'var(--t3)' }}>
            {todayRecord?.clock_out || '--:--'}
          </span>
        </div>
        <div className="info-row">
          <span className="info-label">工時</span>
          <span className="info-value">{todayRecord?.hours ? `${todayRecord.hours}h` : '-'}</span>
        </div>
        <div className="info-row">
          <span className="info-label">狀態</span>
          <span className={`badge ${todayRecord?.status === '正常' ? 'badge-green' : todayRecord?.status === '遲到' ? 'badge-orange' : 'badge-cyan'}`}>
            {todayRecord?.status || '未打卡'}
          </span>
        </div>
      </div>
    </div>
  )
}
