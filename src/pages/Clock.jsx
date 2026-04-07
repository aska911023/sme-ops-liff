import { useState, useEffect } from 'react'
import { MapPin, Wifi, AlertTriangle, CheckCircle, XCircle } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'

// Haversine formula: distance between two GPS points in meters
function getDistance(lat1, lng1, lat2, lng2) {
  const R = 6371000
  const toRad = (d) => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

// Check if an IP matches a CIDR or exact IP entry
function ipMatchesCIDR(ip, cidr) {
  const ipToNum = (s) => s.split('.').reduce((acc, oct) => (acc << 8) + parseInt(oct, 10), 0) >>> 0
  const trimmed = cidr.trim()
  if (trimmed.includes('/')) {
    const [network, bits] = trimmed.split('/')
    const mask = ~((1 << (32 - parseInt(bits, 10))) - 1) >>> 0
    return (ipToNum(ip) & mask) === (ipToNum(network) & mask)
  }
  return ip === trimmed
}

export default function ClockPage() {
  const { employee } = useAuth()
  const [time, setTime] = useState(new Date())
  const [todayRecord, setTodayRecord] = useState(null)
  const [loading, setLoading] = useState(false)
  const [location, setLocation] = useState(null)
  const [gpsError, setGpsError] = useState('')
  const [store, setStore] = useState(null)
  const [distance, setDistance] = useState(null)
  const [clientIp, setClientIp] = useState(null)
  const [wifiMatch, setWifiMatch] = useState(null) // null=checking, true/false
  const [msg, setMsg] = useState('')

  const today = new Date().toISOString().slice(0, 10)

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])

  // Load today's record + employee's store GPS
  useEffect(() => {
    if (!employee) return

    supabase
      .from('attendance_records')
      .select('*')
      .eq('employee', employee.name)
      .eq('date', today)
      .maybeSingle()
      .then(({ data }) => setTodayRecord(data))

    // Get store GPS info
    if (employee.store) {
      supabase
        .from('stores')
        .select('name, lat, lng, clock_radius, allowed_wifi')
        .eq('name', employee.store)
        .maybeSingle()
        .then(({ data }) => {
          if (data) setStore(data)
        })
    }

    // Get current GPS
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude })
          setGpsError('')
        },
        (err) => {
          setGpsError(err.code === 1 ? '請開啟定位權限' : '無法取得定位')
        },
        { enableHighAccuracy: true, timeout: 10000 }
      )
    } else {
      setGpsError('此裝置不支援 GPS')
    }

    // Get client IP for WiFi check
    fetch('https://api.ipify.org?format=json')
      .then(r => r.json())
      .then(d => setClientIp(d.ip))
      .catch(() => setClientIp(null))
  }, [employee])

  // Calculate distance when both location and store are available
  useEffect(() => {
    if (location && store?.lat && store?.lng) {
      const d = getDistance(location.lat, location.lng, store.lat, store.lng)
      setDistance(Math.round(d))
    }
  }, [location, store])

  // Check WiFi IP match (proper CIDR)
  useEffect(() => {
    if (!clientIp || !store?.allowed_wifi?.length) {
      setWifiMatch(null)
      return
    }
    setWifiMatch(store.allowed_wifi.some(rule => ipMatchesCIDR(clientIp, rule)))
  }, [clientIp, store])

  const radius = store?.clock_radius || 150
  const isInRange = distance !== null && distance <= radius
  const hasWifiRule = store?.allowed_wifi?.length > 0
  // Can clock if: GPS in range OR WiFi IP matches. If neither rule is set, allow.
  const gpsOk = isInRange || !store?.lat
  const wifiOk = !hasWifiRule || wifiMatch === true
  const canClock = location && (gpsOk || wifiOk)

  // Determine clock-in location name
  const getLocationName = () => {
    if (gpsOk && store?.name) return store.name
    if (wifiOk && store?.name) return store.name
    return '外部位置'
  }

  const handleClock = async (type) => {
    if (loading || !canClock) return
    setLoading(true)
    const now = new Date().toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit', hour12: false })

    try {
      if (type === 'in') {
        const row = {
          employee: employee.name,
          date: today,
          clock_in: now,
          status: now <= '09:00' ? '正常' : '遲到',
          clock_in_lat: location?.lat || null,
          clock_in_lng: location?.lng || null,
          clock_in_ip: clientIp || null,
          clock_in_location: getLocationName(),
        }
        const { data, error } = await supabase.from('attendance_records').insert(row).select().single()
        if (error) { setMsg(`打卡失敗: ${error.message}`); setLoading(false); return }
        if (data) { setTodayRecord(data); setMsg('上班打卡成功 ✓') }
      } else {
        const clockIn = todayRecord?.clock_in?.slice(0, 5) || '09:00'
        const hours = Math.max(0, Math.round((new Date(`2000-01-01T${now}`) - new Date(`2000-01-01T${clockIn}`)) / 3600000 * 10) / 10)
        const { data, error } = await supabase.from('attendance_records')
          .update({
            clock_out: now,
            hours,
            clock_out_lat: location?.lat || null,
            clock_out_lng: location?.lng || null,
            clock_out_ip: clientIp || null,
          })
          .eq('id', todayRecord.id)
          .select().single()
        if (error) { setMsg(`打卡失敗: ${error.message}`); setLoading(false); return }
        if (data) { setTodayRecord(data); setMsg('下班打卡成功 ✓') }
      }
    } catch (e) {
      setMsg('打卡失敗: ' + (e.message || '未知錯誤'))
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
      <div style={{ textAlign: 'center', margin: '20px 0 24px' }}>
        <div className="clock-display">
          {time.toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}
        </div>
      </div>

      {/* GPS Status Card */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <MapPin size={16} style={{ color: 'var(--cyan)' }} />
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--t2)' }}>GPS 定位狀態</span>
        </div>

        {gpsError ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--red)', fontSize: 13 }}>
            <XCircle size={16} />
            <span>{gpsError}</span>
          </div>
        ) : !location ? (
          <div style={{ fontSize: 13, color: 'var(--t3)' }}>定位中...</div>
        ) : (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--t3)', marginBottom: 8 }}>
              <span>門市：{store?.name || employee?.store || '-'}</span>
              <span>範圍：{radius}m</span>
            </div>

            {distance !== null && store?.lat ? (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '10px 14px', borderRadius: 10,
                background: isInRange ? 'var(--green-dim)' : 'var(--red-dim)',
                border: `1px solid ${isInRange ? 'rgba(52,211,153,0.2)' : 'rgba(248,113,113,0.2)'}`,
              }}>
                {isInRange ? (
                  <CheckCircle size={18} style={{ color: 'var(--green)', flexShrink: 0 }} />
                ) : (
                  <AlertTriangle size={18} style={{ color: 'var(--red)', flexShrink: 0 }} />
                )}
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: isInRange ? 'var(--green)' : 'var(--red)' }}>
                    {isInRange ? '在打卡範圍內' : '不在打卡範圍內'}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--t3)', marginTop: 2 }}>
                    距離門市 {distance >= 1000 ? `${(distance / 1000).toFixed(1)}km` : `${distance}m`}
                    {!isInRange && ` (需在 ${radius}m 以內)`}
                  </div>
                </div>
              </div>
            ) : (
              <div style={{ fontSize: 12, color: 'var(--t3)' }}>
                <CheckCircle size={14} style={{ color: 'var(--green)', verticalAlign: 'middle', marginRight: 4 }} />
                GPS 已取得（門市未設定座標，不限制範圍）
              </div>
            )}
          </>
        )}

        {/* WiFi IP Status */}
        {hasWifiRule && (
          <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <Wifi size={14} style={{ color: 'var(--cyan)' }} />
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--t2)' }}>WiFi 網路驗證</span>
            </div>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '10px 14px', borderRadius: 10,
              background: wifiMatch === true ? 'var(--green-dim)' : wifiMatch === false ? 'var(--red-dim)' : 'var(--card)',
              border: `1px solid ${wifiMatch === true ? 'rgba(52,211,153,0.2)' : wifiMatch === false ? 'rgba(248,113,113,0.2)' : 'var(--border)'}`,
            }}>
              {wifiMatch === null ? (
                <span style={{ fontSize: 13, color: 'var(--t3)' }}>偵測中...</span>
              ) : wifiMatch ? (
                <>
                  <CheckCircle size={18} style={{ color: 'var(--green)', flexShrink: 0 }} />
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--green)' }}>門市 WiFi 已連線</div>
                    <div style={{ fontSize: 12, color: 'var(--t3)', marginTop: 2 }}>IP: {clientIp}</div>
                  </div>
                </>
              ) : (
                <>
                  <AlertTriangle size={18} style={{ color: 'var(--red)', flexShrink: 0 }} />
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--red)' }}>非門市網路</div>
                    <div style={{ fontSize: 12, color: 'var(--t3)', marginTop: 2 }}>IP: {clientIp || '無法取得'}（請連接門市 WiFi）</div>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Clock Button */}
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 32 }}>
        {!clockedIn ? (
          <button
            className={`clock-btn ${canClock ? 'clock-in' : ''}`}
            onClick={() => handleClock('in')}
            disabled={loading || !canClock}
            style={!canClock ? {
              background: 'var(--card)', border: '2px solid var(--border)',
              color: 'var(--t3)', boxShadow: 'none', cursor: 'not-allowed',
              width: 140, height: 140, borderRadius: '50%',
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              gap: 4, fontSize: 16, fontWeight: 800,
            } : undefined}
          >
            <span style={{ fontSize: 28 }}>{canClock ? '👆' : '📍'}</span>
            {canClock ? '上班打卡' : '範圍外'}
          </button>
        ) : !clockedOut ? (
          <button
            className={`clock-btn ${canClock ? 'clock-out' : ''}`}
            onClick={() => handleClock('out')}
            disabled={loading || !canClock}
            style={!canClock ? {
              background: 'var(--card)', border: '2px solid var(--border)',
              color: 'var(--t3)', boxShadow: 'none', cursor: 'not-allowed',
              width: 140, height: 140, borderRadius: '50%',
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              gap: 4, fontSize: 16, fontWeight: 800,
            } : undefined}
          >
            <span style={{ fontSize: 28 }}>{canClock ? '👋' : '📍'}</span>
            {canClock ? '下班打卡' : '範圍外'}
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
          background: msg.includes('失敗') ? 'var(--red-dim)' : 'var(--green-dim)',
          color: msg.includes('失敗') ? 'var(--red)' : 'var(--green)',
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
        {todayRecord?.clock_in_location && (
          <div className="info-row">
            <span className="info-label">打卡地點</span>
            <span className="info-value" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <MapPin size={12} /> {todayRecord.clock_in_location}
            </span>
          </div>
        )}
        {todayRecord?.clock_in_ip && (
          <div className="info-row">
            <span className="info-label">IP 位址</span>
            <span className="info-value" style={{ fontFamily: 'monospace', fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}>
              <Wifi size={12} /> {todayRecord.clock_in_ip}
            </span>
          </div>
        )}
      </div>
    </div>
  )
}
