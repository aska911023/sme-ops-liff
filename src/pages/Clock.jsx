import { useState, useEffect } from 'react'
import { MapPin, Wifi, AlertTriangle, CheckCircle, XCircle, CalendarDays } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'

const GPS_ACCURACY_THRESHOLD = 200

// 2-mode clock-in tag — 對齊主系統 supabase/functions/clock-in/index.ts VALID_MODES
// （2026-05-28 簡化：normal 鎖 IP/GPS；outing 免位置驗證 + 標籤'外出'。兩者皆不查班表）
const MODE_META = {
  normal: { label: '一般', icon: '🕒', color: 'var(--cyan)',  dim: 'var(--cyan-dim)' },
  outing: { label: '外出', icon: '✈️', color: 'var(--green)', dim: 'var(--green-dim)' },
}

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
  const { employee, lineProfile } = useAuth()
  const navigate = useNavigate()
  const lineUserId = lineProfile?.lineUserId
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
  const [clockMode, setClockMode] = useState('normal')  // normal | outing (2026-05-28 簡化)

  const today = new Date().toISOString().slice(0, 10)

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])

  // Load today's record + employee's store GPS
  useEffect(() => {
    if (!employee) return

    // ★ 走 SECURITY DEFINER RPC — anon 直查 attendance_records 會被 RLS silent skip
    //   (policy: employee = current_employee_name()，LIFF anon 沒 auth → 永遠看不到)
    if (lineUserId) {
      supabase
        .rpc('liff_get_today_attendance', { p_line_user_id: lineUserId, p_date: today })
        .then(({ data }) => setTodayRecord((data && data[0]) || null))
    }

    // Get store GPS info via LIFF RPC (bypasses stores RLS for anon key)
    if (employee.id) {
      supabase
        .rpc('liff_get_store_for_employee', { p_employee_id: employee.id })
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
        employee:     employee.name,
        line_user_id: lineUserId || null,   // LIFF 走 LINE 身份；有帶就跳過 JWT 驗證
        action,
        lat:      location?.lat || null,
        lng:      location?.lng || null,
        accuracy: gpsAccuracy  || null,
        ip:       clientIp     || null,
        clock_mode:   clockMode,
      })
      setTodayRecord(data.record)
      const base = type === 'in' ? '上班打卡成功 ✓' : '下班打卡成功 ✓'
      // 後端 reminder 訊息（outing 模式）
      if (data.reminder) {
        setMsg(base)
        setTimeout(() => setMsg('⚠️ ' + data.reminder), 1500)
      } else {
        setMsg(base)
      }
      // 成功後重置模式
      setClockMode('normal')
    } catch (e) {
      setMsg('打卡失敗: ' + (e.message || '未知錯誤'))
    }
    setLoading(false)
    // outing 有 reminder 訊息，多顯示一些時間
    const msgDuration = clockMode === 'outing' ? 8000 : 5000
    setTimeout(() => setMsg(''), msgDuration)
  }

  const clockedIn = !!todayRecord?.clock_in
  const clockedOut = !!todayRecord?.clock_out
  const showModePicker = !clockedOut  // 完成下班後不再讓選

  return (
    <div className="page">
      <div className="header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <div>
          <div className="header-title">打卡</div>
          <div className="header-sub">{today}</div>
        </div>
        <button
          onClick={() => navigate('/attendance-history')}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            padding: '6px 10px', borderRadius: 8, flexShrink: 0,
            background: 'var(--cyan-dim)', color: 'var(--cyan)',
            border: '1px solid var(--cyan)', fontSize: 12, fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          <CalendarDays size={12} /> 紀錄
        </button>
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

      {/* 4 模式打卡選擇 */}
      {showModePicker && (
        <div className="card" style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--t2)', marginBottom: 10 }}>打卡模式</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 6, marginBottom: 10 }}>
            {Object.entries(MODE_META).map(([key, m]) => {
              const active = clockMode === key
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setClockMode(key)}
                  style={{
                    padding: '10px 4px', borderRadius: 10, cursor: 'pointer',
                    background: active ? m.dim : 'var(--card)',
                    border: `1px solid ${active ? m.color : 'var(--border)'}`,
                    color: active ? m.color : 'var(--t3)',
                    fontSize: 11, fontWeight: 700,
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
                  }}
                >
                  <span style={{ fontSize: 18 }}>{m.icon}</span>
                  {m.label}
                </button>
              )
            })}
          </div>

          {/* 模式說明 */}
          <div style={{
            padding: '10px 14px', borderRadius: 10,
            background: MODE_META[clockMode].dim,
            border: `1px solid ${MODE_META[clockMode].color}`,
            fontSize: 12, lineHeight: 1.5, color: 'var(--t2)',
          }}>
            {clockMode === 'normal' && <span>🕒 一般打卡：須在店內網路或 GPS 範圍內。</span>}
            {clockMode === 'outing' && <span style={{ color: 'var(--green)' }}>✈️ 外出打卡：免位置驗證，紀錄標籤為「外出」。</span>}
          </div>
        </div>
      )}

      {/* Clock Button */}
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 32 }}>
        {!clockedIn ? (
          <button
            className={`clock-btn ${canClock && clockMode === 'normal' ? 'clock-in' : ''}`}
            onClick={() => handleClock('in')}
            disabled={loading || !canClock}
            style={!canClock ? {
              background: 'var(--card)', border: '2px solid var(--border)',
              color: 'var(--t3)', boxShadow: 'none', cursor: 'not-allowed',
              width: 140, height: 140, borderRadius: '50%',
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              gap: 4, fontSize: 16, fontWeight: 800,
            } : (clockMode !== 'normal' ? {
              background: MODE_META[clockMode].color, color: '#fff',
              width: 140, height: 140, borderRadius: '50%', border: 'none',
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              gap: 4, fontSize: 15, fontWeight: 800, cursor: 'pointer',
              boxShadow: '0 4px 14px rgba(0,0,0,0.25)',
            } : undefined)}
          >
            <span style={{ fontSize: 28 }}>{canClock ? (clockMode === 'normal' ? '👆' : MODE_META[clockMode].icon) : '📍'}</span>
            {!canClock ? '範圍外' : (clockMode === 'normal' ? '上班打卡' : `${MODE_META[clockMode].label}上班`)}
          </button>
        ) : !clockedOut ? (
          <button
            className={`clock-btn ${canClock && clockMode === 'normal' ? 'clock-out' : ''}`}
            onClick={() => handleClock('out')}
            disabled={loading || !canClock}
            style={!canClock ? {
              background: 'var(--card)', border: '2px solid var(--border)',
              color: 'var(--t3)', boxShadow: 'none', cursor: 'not-allowed',
              width: 140, height: 140, borderRadius: '50%',
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              gap: 4, fontSize: 16, fontWeight: 800,
            } : (clockMode !== 'normal' ? {
              background: MODE_META[clockMode].color, color: '#fff',
              width: 140, height: 140, borderRadius: '50%', border: 'none',
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              gap: 4, fontSize: 15, fontWeight: 800, cursor: 'pointer',
              boxShadow: '0 4px 14px rgba(0,0,0,0.25)',
            } : undefined)}
          >
            <span style={{ fontSize: 28 }}>{canClock ? (clockMode === 'normal' ? '👋' : MODE_META[clockMode].icon) : '📍'}</span>
            {!canClock ? '範圍外' : (clockMode === 'normal' ? '下班打卡' : `${MODE_META[clockMode].label}下班`)}
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
          <span className={`badge ${todayRecord?.status === '正常' ? 'badge-green' : todayRecord?.status === '遲到' ? 'badge-orange' : todayRecord?.status === '加班' ? 'badge-purple' : todayRecord?.status === '請假' ? 'badge-blue' : todayRecord?.status === '外出' ? 'badge-green' : 'badge-cyan'}`}>
            {todayRecord?.status || '未打卡'}
          </span>
        </div>
        {/* 4 模式 tag — 與主系統 Attendance.jsx 對齊 */}
        {(todayRecord?.clock_in_mode && todayRecord.clock_in_mode !== 'normal') || (todayRecord?.clock_out_mode && todayRecord.clock_out_mode !== 'normal') ? (
          <div className="info-row">
            <span className="info-label">模式</span>
            <span style={{ display: 'inline-flex', gap: 4, flexWrap: 'wrap' }}>
              {todayRecord.clock_in_mode && todayRecord.clock_in_mode !== 'normal' && MODE_META[todayRecord.clock_in_mode] && (
                <span style={{
                  padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 700,
                  background: MODE_META[todayRecord.clock_in_mode].dim,
                  color: MODE_META[todayRecord.clock_in_mode].color,
                }}>
                  上{MODE_META[todayRecord.clock_in_mode].label}
                </span>
              )}
              {todayRecord.clock_out_mode && todayRecord.clock_out_mode !== 'normal'
                && todayRecord.clock_out_mode !== todayRecord.clock_in_mode
                && MODE_META[todayRecord.clock_out_mode] && (
                <span style={{
                  padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 700,
                  background: MODE_META[todayRecord.clock_out_mode].dim,
                  color: MODE_META[todayRecord.clock_out_mode].color,
                }}>
                  下{MODE_META[todayRecord.clock_out_mode].label}
                </span>
              )}
            </span>
          </div>
        ) : null}
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
