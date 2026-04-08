import { useState, useEffect } from 'react'
import { MapPin, Wifi, AlertTriangle, CheckCircle, XCircle } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'

const GPS_ACCURACY_THRESHOLD = 200

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
  const trimmed = cidr.trim()
  if (!trimmed) return false
  const ipToNum = (s) => {
    const parts = s.split('.')
    if (parts.length !== 4) return null
    let num = 0
    for (const p of parts) {
      const n = parseInt(p, 10)
      if (isNaN(n) || n < 0 || n > 255) return null
      num = (num << 8) + n
    }
    return num >>> 0
  }
  const ipNum = ipToNum(ip)
  if (ipNum === null) return false
  if (trimmed.includes('/')) {
    const [network, bitsStr] = trimmed.split('/')
    const bits = parseInt(bitsStr, 10)
    if (isNaN(bits) || bits < 0 || bits > 32) return false
    const netNum = ipToNum(network)
    if (netNum === null) return false
    const mask = bits === 0 ? 0 : ~((1 << (32 - bits)) - 1) >>> 0
    return (ipNum & mask) === (netNum & mask)
  }
  return ip === trimmed
}

// Get public IP with retry + backup API
async function fetchPublicIP() {
  const apis = [
    'https://api.ipify.org?format=json',
    'https://api.seeip.org/jsonip',
  ]
  for (const url of apis) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(5000) })
      if (!res.ok) continue
      const data = await res.json()
      return data.ip
    } catch { /* try next */ }
  }
  return null
}

// Server-side clock-in via Edge Function
async function serverClockIn(payload) {
  const url = import.meta.env.VITE_SUPABASE_URL
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY
  const res = await fetch(`${url}/functions/v1/clock-in`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${key}`,
      'apikey': key,
    },
    body: JSON.stringify(payload),
  })
  const data = await res.json()
  if (!res.ok) {
    const msg = data.reasons ? `${data.error}\n${data.reasons.join('\n')}` : (data.error || '伺服器錯誤')
    throw new Error(msg)
  }
  return data
}

export default function ClockPage() {
  const { employee } = useAuth()
  const [time, setTime] = useState(new Date())
  const [todayRecord, setTodayRecord] = useState(null)
  const [loading, setLoading] = useState(false)
  const [location, setLocation] = useState(null)
  const [gpsError, setGpsError] = useState('')
  const [store, setStore] = useState(null)
  const [gpsAccuracy, setGpsAccuracy] = useState(null)
  const [gpsWeak, setGpsWeak] = useState(false)
  const [distance, setDistance] = useState(null)
  const [clientIp, setClientIp] = useState(null)
  const [ipError, setIpError] = useState(false)
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
          const { latitude, longitude, accuracy } = pos.coords
          setLocation({ lat: latitude, lng: longitude })
          setGpsAccuracy(Math.round(accuracy))
          if (accuracy > GPS_ACCURACY_THRESHOLD) {
            setGpsWeak(true)
            setGpsError(`GPS 精確度不足（${Math.round(accuracy)}m），定位結果僅供參考`)
          } else {
            setGpsWeak(false)
            setGpsError('')
          }
        },
        (err) => {
          setGpsError(err.code === 1 ? '請開啟定位權限' : '無法取得定位')
        },
        { enableHighAccuracy: true, timeout: 15000 }
      )
    } else {
      setGpsError('此裝置不支援 GPS')
    }

    // Get client IP for WiFi check (with retry + backup)
    fetchPublicIP().then(ip => {
      if (ip) {
        setClientIp(ip)
        setIpError(false)
      } else {
        setClientIp(null)
        setIpError(true)
      }
    })
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
  const isInRange = distance !== null && distance <= radius && !gpsWeak
  const hasWifiRule = store?.allowed_wifi?.length > 0
  // Can clock if: GPS in range (and accurate) OR WiFi IP matches. If neither rule is set, allow.
  const gpsOk = (isInRange || !store?.lat) && !gpsWeak
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

    try {
      const action = type === 'in' ? 'clock_in' : 'clock_out'
      const data = await serverClockIn({
        employee: employee.name,
        action,
        lat: location?.lat || null,
        lng: location?.lng || null,
        accuracy: gpsAccuracy || null,
        ip: clientIp || null,
      })
      setTodayRecord(data.record)
      setMsg(type === 'in' ? '上班打卡成功 ✓' : '下班打卡成功 ✓')
    } catch (e) {
      setMsg('打卡失敗: ' + (e.message || '未知錯誤'))
    }
    setLoading(false)
    setTimeout(() => setMsg(''), 5000)
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
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: gpsWeak ? 'var(--orange, #fb923c)' : 'var(--red)', fontSize: 13 }}>
            {gpsWeak ? <AlertTriangle size={16} /> : <XCircle size={16} />}
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
              {ipError ? (
                <>
                  <AlertTriangle size={18} style={{ color: 'var(--red)', flexShrink: 0 }} />
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--red)' }}>無法取得網路 IP</div>
                    <div style={{ fontSize: 12, color: 'var(--t3)', marginTop: 2 }}>請確認網路連線正常</div>
                  </div>
                </>
              ) : wifiMatch === null ? (
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
