import { useState, useEffect, useMemo } from 'react'
import { ChevronLeft, ChevronRight, AlertCircle, Clock, Plus } from 'lucide-react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'

const TYPE_META = {
  MISSING:     { label: '未打卡',   color: 'var(--red)',    dim: 'rgba(239,68,68,0.12)',  icon: '⚠️', actions: ['correction', 'leave'] },
  LATE:        { label: '遲到',     color: 'var(--orange)', dim: 'rgba(251,146,60,0.12)', icon: '⏰', actions: ['correction', 'leave'] },
  EARLY_LEAVE: { label: '早退',     color: 'var(--orange)', dim: 'rgba(251,146,60,0.12)', icon: '⏰', actions: ['correction', 'leave'] },
  UNSCHEDULED: { label: '未排班但打卡', color: 'var(--green)',  dim: 'var(--green-dim)',     icon: '✨', actions: ['overtime'] },
  OVERWORK:    { label: '多上時數', color: 'var(--green)',  dim: 'var(--green-dim)',     icon: '✨', actions: ['overtime'] },
  UNDERTIME:   { label: '時數不足', color: '#f59e0b',       dim: 'rgba(245,158,11,0.12)', icon: '🔻', actions: ['leave'] },
}

const ACTION_META = {
  correction: { label: '申請補卡', path: '/clock-correction', color: 'var(--cyan)' },
  leave:      { label: '申請請假', path: '/leave',            color: 'var(--blue)' },
  overtime:   { label: '申請加班', path: '/overtime',         color: 'var(--orange)' },
}

function formatYM(y, m) {
  return `${y}-${String(m).padStart(2, '0')}`
}

export default function AttendanceIssues() {
  const { lineProfile } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  // 預設上個月（如果 URL 有帶 ?ym=2026-05 用那個）
  const now = new Date()
  const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const urlYM = searchParams.get('ym')
  const initYM = urlYM && /^\d{4}-\d{2}$/.test(urlYM)
    ? { y: parseInt(urlYM.slice(0, 4)), m: parseInt(urlYM.slice(5, 7)) }
    : { y: lastMonth.getFullYear(), m: lastMonth.getMonth() + 1 }

  const [year, setYear] = useState(initYM.y)
  const [month, setMonth] = useState(initYM.m)
  const [diffs, setDiffs] = useState([])
  const [loading, setLoading] = useState(true)

  const ym = formatYM(year, month)
  const lineUserId = lineProfile?.lineUserId

  useEffect(() => {
    if (!lineUserId) return
    setLoading(true)
    supabase
      .rpc('liff_get_my_attendance_diff', { p_line_user_id: lineUserId, p_year_month: ym })
      .then(({ data }) => {
        setDiffs(Array.isArray(data) ? data.filter(d => d.diff_type) : [])
        setLoading(false)
      })
  }, [lineUserId, ym])

  const grouped = useMemo(() => {
    const cnt = {}
    for (const d of diffs) cnt[d.diff_type] = (cnt[d.diff_type] || 0) + 1
    return cnt
  }, [diffs])

  const goPrev = () => {
    if (month === 1) { setMonth(12); setYear(year - 1) }
    else setMonth(month - 1)
  }
  const goNext = () => {
    if (month === 12) { setMonth(1); setYear(year + 1) }
    else setMonth(month + 1)
  }

  const handleApply = (diff, actionType) => {
    const meta = ACTION_META[actionType]
    if (!meta) return
    // 帶 date 跳轉，對應頁面可以選擇預填（如果該頁支援）
    navigate(`${meta.path}?date=${diff.diff_date}`)
  }

  return (
    <div className="page">
      <div className="header">
        <div>
          <div className="header-title">補件中心</div>
          <div className="header-sub">打卡核對 / 待申請項目</div>
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
      {!loading && diffs.length > 0 && (
        <div className="card" style={{ marginBottom: 12, padding: '10px 14px' }}>
          <div style={{ fontSize: 13, color: 'var(--t2)', marginBottom: 6 }}>
            共 <strong style={{ color: 'var(--orange)', fontSize: 16 }}>{diffs.length}</strong> 筆待處理
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {Object.entries(grouped).map(([k, v]) => (
              <span key={k} style={{
                padding: '2px 8px', borderRadius: 5, fontSize: 11, fontWeight: 600,
                background: TYPE_META[k]?.dim || '#eee',
                color: TYPE_META[k]?.color || '#666',
              }}>
                {TYPE_META[k]?.icon} {TYPE_META[k]?.label}: {v}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* 差異列表 */}
      {loading ? (
        <div className="card" style={{ padding: 24, textAlign: 'center', color: 'var(--t3)' }}>載入中…</div>
      ) : diffs.length === 0 ? (
        <div className="card" style={{ padding: 32, textAlign: 'center' }}>
          <div style={{ fontSize: 44, marginBottom: 8 }}>🎉</div>
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--green)', marginBottom: 4 }}>本月無待處理項目</div>
          <div style={{ fontSize: 12, color: 'var(--t3)' }}>打卡與排班完全吻合，或已都送出申請</div>
        </div>
      ) : (
        diffs.map(d => {
          const meta = TYPE_META[d.diff_type] || { label: d.diff_type, color: '#666', dim: '#eee', icon: '?', actions: [] }
          return (
            <div key={`${d.diff_date}-${d.diff_type}`} className="card" style={{ marginBottom: 8, padding: '12px 14px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--t1)' }}>
                    {d.diff_date}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 2 }}>
                    {new Date(d.diff_date).toLocaleDateString('zh-TW', { weekday: 'short' })}
                  </div>
                </div>
                <span style={{
                  padding: '3px 10px', borderRadius: 6, fontSize: 11, fontWeight: 700,
                  background: meta.dim, color: meta.color,
                }}>
                  {meta.icon} {meta.label}
                </span>
              </div>

              <div style={{ fontSize: 13, color: 'var(--t2)', marginBottom: 10, lineHeight: 1.5 }}>
                {d.message}
              </div>

              {/* 排班 vs 實際 對照 */}
              {(d.expected_shift || d.actual_clock_in) && (
                <div style={{
                  background: 'var(--card)', padding: '8px 10px', borderRadius: 8,
                  marginBottom: 10, fontSize: 11, color: 'var(--t3)',
                  display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4,
                }}>
                  <div>排班：{d.expected_shift || '無班'} {d.expected_hours ? `(${d.expected_hours}h)` : ''}</div>
                  <div>實際：{d.actual_clock_in ? `${d.actual_clock_in.slice(0,5)}-${d.actual_clock_out?.slice(0,5) || '?'}` : '未打卡'}</div>
                </div>
              )}

              {/* Action 按鈕 */}
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {meta.actions.map(act => {
                  const aMeta = ACTION_META[act]
                  return (
                    <button
                      key={act}
                      onClick={() => handleApply(d, act)}
                      style={{
                        padding: '6px 12px', borderRadius: 8, border: 'none', cursor: 'pointer',
                        background: aMeta.color, color: '#fff', fontSize: 12, fontWeight: 700,
                        display: 'inline-flex', alignItems: 'center', gap: 4,
                      }}
                    >
                      <Plus size={12} /> {aMeta.label}
                    </button>
                  )
                })}
              </div>
            </div>
          )
        })
      )}

      <div style={{ height: 40 }} />
    </div>
  )
}
