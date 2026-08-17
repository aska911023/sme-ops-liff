import { useState, useEffect, useMemo } from 'react'
import { ChevronLeft, ChevronRight, Clock, MapPin, X } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'

const STATUS_STYLE = {
  '正常': { bg: 'var(--green-dim)', color: 'var(--green)', dot: 'var(--green)' },
  '外出': { bg: 'var(--green-dim)', color: 'var(--green)', dot: 'var(--green)' },
  '遲到': { bg: 'rgba(251,146,60,0.15)', color: 'var(--orange)', dot: 'var(--orange)' },
  '早退': { bg: 'rgba(251,146,60,0.15)', color: 'var(--orange)', dot: 'var(--orange)' },
  '請假': { bg: 'var(--blue-dim)',   color: 'var(--blue)',  dot: 'var(--blue)' },
  '加班': { bg: 'rgba(251,146,60,0.15)', color: 'var(--orange)', dot: 'var(--orange)' },
  // 異常/缺卡（紅色，提醒去補卡）
  '缺下班卡': { bg: 'rgba(239,68,68,0.15)', color: '#ef4444', dot: '#ef4444' },
  '缺上班卡': { bg: 'rgba(239,68,68,0.15)', color: '#ef4444', dot: '#ef4444' },
  '缺卡':     { bg: 'rgba(239,68,68,0.15)', color: '#ef4444', dot: '#ef4444' },
  '未打卡':   { bg: 'rgba(239,68,68,0.15)', color: '#ef4444', dot: '#ef4444' },
  '打卡異常': { bg: 'rgba(239,68,68,0.15)', color: '#ef4444', dot: '#ef4444' },
}

// 已知的正常狀態值（status 欄曾被打卡流程誤寫入 GPS 座標，非已知值一律用打卡狀況重推）
const KNOWN_STATUS = new Set(['正常', '遲到', '外出', '未打卡', '補登', '加班', '請假', '上班中'])

// 遲到/早退：跟當天班表時段比。上班晚於班表=遲到、下班早於班表=早退（分鐘）；跨午夜班(end<=start)自動 +1440。
// 對齊主系統 Attendance.jsx 的 lateEarly()。加班單的打卡是加班時段，不拿去比班表。
const toMin = (t) => { if (!t) return null; const [h, m] = String(t).split(':'); return Number(h) * 60 + Number(m) }
function lateEarly(r, sched) {
  if (!r || !sched) return null
  if (r.overtime_request_id || r.clock_in_mode === 'overtime' || r.status === '加班') return null
  let start = toMin(sched.start), end = toMin(sched.end)
  if (start == null || end == null) return null
  if (end <= start) end += 1440
  const ci = toMin(r.clock_in), coRaw = toMin(r.clock_out)
  let late = 0, early = 0
  if (ci != null && ci > start) late = ci - start
  if (coRaw != null) { let co = coRaw; if (co < start) co += 1440; if (co < end) early = end - co }
  return (late > 0 || early > 0) ? { late, early } : null
}

// 打卡時段與班表時段「完全無交集」= 在錯的時間打卡（非遲到/早退，例:排15:00-02:00卻打11:00-13:01）→ 異常。
// 只在有完整上下班卡時判斷;對齊跨午夜(打卡窗試 +0 / +1440)。對齊主系統 Attendance.jsx。
function clockOffSched(r, sched) {
  if (!r || !sched) return false
  if (r.overtime_request_id || r.clock_in_mode === 'overtime' || r.status === '加班') return false
  if (r.clock_in_mode === 'outing' || r.status === '外出') return false
  const ci = toMin(r.clock_in), co = toMin(r.clock_out)
  if (ci == null || co == null) return false
  let start = toMin(sched.start), end = toMin(sched.end)
  if (start == null || end == null) return false
  if (end <= start) end += 1440
  let cs = ci, ce = co; if (ce < cs) ce += 1440
  const ov = (a1, a2, b1, b2) => a1 < b2 && a2 > b1
  return !(ov(cs, ce, start, end) || ov(cs + 1440, ce + 1440, start, end))
}

// 顯示用狀態：過去日子「有上班沒下班」= 缺卡（異常），提醒補卡；跟班表不同（遲到/早退/0工時）= 異常；status 被污染時用打卡狀況推
function computeDayStatus(r, dateStr, todayStr, sched) {
  const isPast = dateStr < todayStr
  // 沒打卡紀錄:有排班上班班(過去日) = 未打卡(異常);沒排班 = 無資料
  if (!r) return (sched && isPast) ? '未打卡' : null
  const hasIn = !!r.clock_in, hasOut = !!r.clock_out
  const isOuting = r.clock_in_mode === 'outing' || r.status === '外出'
  // 有列但整天沒打卡 + 有排班(過去) = 未打卡
  if (isPast && !isOuting && !hasIn && !hasOut && sched) return '未打卡'
  if (isPast && !isOuting) {
    if (hasIn && !hasOut) return '缺下班卡'
    if (!hasIn && hasOut) return '缺上班卡'
  }
  // 跟班表不同 = 異常;外出不算
  if (!isOuting && hasIn && hasOut && r.clock_in === r.clock_out) return '打卡異常'  // 上下班同一時間(0 工時,多半誤點兩下)
  if (!isOuting && hasIn && hasOut && clockOffSched(r, sched)) return '打卡異常'      // 打卡時段與班表完全不符(在錯的時間打卡)
  if (!isOuting) {
    const le = lateEarly(r, sched)
    if (le?.late > 0) return '遲到'      // 上班晚於班表
    if (le?.early > 0) return '早退'     // 下班早於班表
    if (!sched && r.is_late) return '遲到'  // 沒抓到班表時退回 server 端 is_late
  }
  if (r.status && !KNOWN_STATUS.has(r.status)) {
    // status 是被污染的髒值（如 GPS 座標）→ 依打卡狀況重推
    if (hasIn && hasOut) return '正常'
    if (hasIn || hasOut) return isPast ? '缺卡' : '上班中'
    return '未打卡'
  }
  return r.status || (hasIn ? '正常' : null)
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
  const [schedules, setSchedules] = useState([])   // 當月排班時段（比對遲到/早退）
  const [overtimes, setOvertimes] = useState([])   // 已核准加班單 → 當天加班紀錄
  const [loading, setLoading] = useState(true)
  const [selectedRecord, setSelectedRecord] = useState(null)

  const ym = `${year}-${String(month).padStart(2, '0')}`
  const lineUserId = lineProfile?.lineUserId

  useEffect(() => {
    if (!lineUserId) return
    setLoading(true)
    Promise.all([
      supabase.rpc('liff_get_my_attendance_month', { p_line_user_id: lineUserId, p_year_month: ym }),
      supabase.rpc('liff_list_overtime_requests', { p_line_user_id: lineUserId }),
      supabase.rpc('liff_get_my_schedule_month', { p_line_user_id: lineUserId, p_year_month: ym }),
    ]).then(([att, ot, sch]) => {
      setRecords(Array.isArray(att.data) ? att.data : [])
      setOvertimes((Array.isArray(ot.data) ? ot.data : [])
        .filter(o => o.status === '已核准' && String(o.date || '').startsWith(ym)))
      setSchedules(Array.isArray(sch.data) ? sch.data : [])
      setLoading(false)
    })
  }, [lineUserId, ym])

  // dateStr → record map
  const recordByDate = useMemo(() => {
    const m = {}
    for (const r of records) m[r.date] = r
    return m
  }, [records])

  // dateStr → 班表時段 { start, end }（HH:MM:SS）
  const schedByDate = useMemo(() => {
    const m = {}
    for (const s of schedules) m[s.sched_date] = { start: s.start_time, end: s.end_time }
    return m
  }, [schedules])

  // dateStr → 加班單陣列（一天可能多筆）
  const otByDate = useMemo(() => {
    const m = {}
    for (const o of overtimes) { (m[o.date] ||= []).push(o) }
    return m
  }, [overtimes])

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
            const dayOT = otByDate[cell.dateStr]
            const isToday = cell.dateStr === todayStr
            const isWeekend = i % 7 >= 5
            const dStatus = computeDayStatus(r, cell.dateStr, todayStr, schedByDate[cell.dateStr])
            const sty = dStatus ? (STATUS_STYLE[dStatus] || null) : null
            const clickable = !!(r || dayOT || dStatus)   // 未打卡(有排班沒紀錄)也可點看詳情
            return (
              <button
                key={cell.dateStr}
                onClick={() => clickable && setSelectedRecord(r || { date: cell.dateStr })}
                disabled={!clickable}
                style={{
                  aspectRatio: '1', padding: 0,
                  background: (r || dStatus) ? (sty?.bg || 'var(--card-hover)') : 'transparent',
                  border: isToday ? '2px solid var(--cyan)' : '1px solid var(--border)',
                  borderRadius: 8,
                  cursor: clickable ? 'pointer' : 'default',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                  gap: 2, transition: 'all 0.15s',
                  color: isWeekend ? 'var(--orange)' : 'var(--t1)',
                }}
              >
                <div style={{ fontSize: 13, fontWeight: 700 }}>{cell.d}</div>
                {(r || dStatus) ? (
                  <div style={{ fontSize: 9, fontWeight: 600, color: sty?.color || 'var(--t3)', display: 'flex', alignItems: 'center', gap: 1 }}>
                    {dStatus || '?'}{dayOT ? <span style={{ color: 'var(--orange)' }}>⚡</span> : null}
                  </div>
                ) : dayOT ? (
                  <div style={{ fontSize: 9, fontWeight: 600, color: 'var(--orange)' }}>⚡加班</div>
                ) : (
                  <div style={{ width: 4, height: 4, borderRadius: '50%', background: 'var(--border)' }} />
                )}
              </button>
            )
          })}
        </div>
      </div>

      <div style={{ height: 40 }} />

      {/* 詳細 modal — LIFF 內嵌 webview 底部會被 LINE bar 蓋住 → 置中顯示避開 */}
      {selectedRecord && (
        <div
          onClick={() => setSelectedRecord(null)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 100,
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              width: '100%', maxWidth: 480,
              background: 'var(--bg)', borderRadius: 16,
              padding: '16px 20px', maxHeight: '70vh', overflowY: 'auto',
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

            {(() => {
              const mStatus = computeDayStatus(selectedRecord, selectedRecord.date, todayStr, schedByDate[selectedRecord.date])
              const isMissing = mStatus === '缺下班卡' || mStatus === '缺上班卡' || mStatus === '缺卡' || mStatus === '未打卡'
              return (
                <>
                  <div style={{
                    padding: '10px 14px', borderRadius: 10, marginBottom: isMissing ? 6 : 10,
                    background: (STATUS_STYLE[mStatus] || { bg: 'var(--card)' }).bg,
                    color: (STATUS_STYLE[mStatus] || { color: 'var(--t1)' }).color,
                    fontWeight: 700, textAlign: 'center',
                  }}>
                    {mStatus || '—'}
                  </div>
                  {isMissing && (
                    <div style={{ fontSize: 11, color: '#ef4444', textAlign: 'center', marginBottom: 10 }}>
                      ⚠️ 打卡不完整，請至「補打卡」補上
                    </div>
                  )}
                </>
              )
            })()}

            <div style={{ background: 'var(--card)', padding: '12px 14px', borderRadius: 10, marginBottom: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <Clock size={14} style={{ color: 'var(--cyan)' }} />
                <span style={{ fontSize: 13, fontFamily: 'monospace', fontWeight: 700, color: 'var(--t1)' }}>
                  {(selectedRecord.clock_in || '').slice(0, 5) || '—'} → {(selectedRecord.clock_out || '').slice(0, 5) || '—'}
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

            {/* 加班（另計，來自加班單起訖時間）— 跟當天正常班分開顯示 */}
            {(otByDate[selectedRecord.date] || []).length > 0 && (
              <div style={{ background: 'rgba(251,146,60,0.12)', padding: '12px 14px', borderRadius: 10, marginBottom: 10, border: '1px solid var(--orange)' }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--orange)', marginBottom: 6 }}>⚡ 加班（另計）</div>
                {otByDate[selectedRecord.date].map(o => (
                  <div key={o.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, marginBottom: 4 }}>
                    <Clock size={13} style={{ color: 'var(--orange)', flexShrink: 0 }} />
                    <span style={{ fontFamily: 'monospace', fontWeight: 700, color: 'var(--t1)' }}>
                      {String(o.start_time || '').slice(0, 5) || '—'} → {String(o.end_time || '').slice(0, 5) || '—'}
                    </span>
                    <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--t2)' }}>
                      {Number(o.ot_hours ?? o.hours ?? 0)} 小時
                    </span>
                  </div>
                ))}
              </div>
            )}

            <div style={{ background: 'var(--card)', padding: '12px 14px', borderRadius: 10, fontSize: 12, color: 'var(--t2)' }}>
              {/* 驗證方式 — 根據 clock_in_method 顯示，避免 outing (bypass) 看起來像 GPS 驗證 */}
              {selectedRecord.clock_in_method === 'gps' && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                  <MapPin size={12} style={{ color: 'var(--green)' }} />
                  <span>GPS 驗證</span>
                  {selectedRecord.clock_in_distance_m != null && (
                    <span style={{ marginLeft: 'auto', color: 'var(--t3)' }}>距離 {selectedRecord.clock_in_distance_m} m</span>
                  )}
                </div>
              )}
              {selectedRecord.clock_in_method === 'wifi' && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                  <MapPin size={12} style={{ color: 'var(--cyan)' }} />
                  <span>WiFi 驗證</span>
                </div>
              )}
              {selectedRecord.clock_in_method === 'bypass' && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6, color: 'var(--green)' }}>
                  <MapPin size={12} />
                  <span>免位置驗證（外出）</span>
                </div>
              )}
              {selectedRecord.clock_in_location && (
                <div style={{ fontSize: 11, color: 'var(--t3)' }}>
                  所屬店點：{selectedRecord.clock_in_location}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
