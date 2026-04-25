import { useState, useEffect, useMemo } from 'react'
import { ChevronLeft, ChevronRight, AlertCircle } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'

const LEAVE_LABEL = {
  annual: '特休', sick: '病假', personal: '事假',
  marriage: '婚假', bereavement: '喪假', maternity: '產假',
  paternity: '陪產假', menstrual: '生理假', family: '家庭照顧假',
  official: '公假', injury: '公傷假',
}
const LEAVE_COLOR = {
  annual: 'var(--cyan)', sick: 'var(--orange)', personal: 'var(--blue)',
  marriage: 'var(--red)', bereavement: 'var(--t2)', maternity: 'var(--purple)',
  paternity: 'var(--purple)', menstrual: 'var(--red)', family: 'var(--green)',
  official: 'var(--green)', injury: 'var(--orange)',
}
const STATUS_STYLE = {
  '待審核': { bg: 'rgba(251,146,60,0.15)', color: 'var(--orange)' },
  '已核准': { bg: 'var(--green-dim)',     color: 'var(--green)' },
  '已拒絕': { bg: 'rgba(248,113,113,0.15)', color: 'var(--red)' },
}

function getMonthDates(year, month) {
  // month is 1-12
  const first = new Date(year, month - 1, 1)
  const last = new Date(year, month, 0)
  const startWeekday = (first.getDay() + 6) % 7 // 週一=0
  const dates = []
  for (let i = 0; i < startWeekday; i++) dates.push(null)
  for (let d = 1; d <= last.getDate(); d++) {
    dates.push(new Date(year, month - 1, d).toISOString().slice(0, 10))
  }
  while (dates.length % 7 !== 0) dates.push(null)
  return dates
}

export default function LeaveBalance() {
  const { lineProfile } = useAuth()
  const navigate = useNavigate()
  const [tab, setTab] = useState('balance') // 'balance' | 'calendar'

  const today = new Date()
  const [year, setYear] = useState(today.getFullYear())
  const [calMonth, setCalMonth] = useState({ y: today.getFullYear(), m: today.getMonth() + 1 })

  const [balances, setBalances] = useState([])
  const [totals, setTotals] = useState({ total: 0, used: 0, remaining: 0 })
  const [teamLeaves, setTeamLeaves] = useState([])
  const [myLeaves, setMyLeaves] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!lineProfile?.lineUserId) return
    supabase.rpc('liff_get_my_leave_balances', {
      p_line_user_id: lineProfile.lineUserId,
      p_year: year,
    }).then(({ data }) => {
      if (data?.ok) {
        setBalances(data.balances || [])
        setTotals(data.totals || totals)
      }
      setLoading(false)
    })
  }, [lineProfile, year])

  useEffect(() => {
    if (!lineProfile?.lineUserId || tab !== 'calendar') return
    const ym = `${calMonth.y}-${String(calMonth.m).padStart(2, '0')}`
    const monthStart = `${ym}-01`
    const monthEnd = new Date(calMonth.y, calMonth.m, 0).toISOString().slice(0, 10)
    Promise.all([
      supabase.rpc('liff_list_team_leaves_in_month', { p_line_user_id: lineProfile.lineUserId, p_year_month: ym }),
      supabase.rpc('liff_list_my_leaves_in_range', { p_line_user_id: lineProfile.lineUserId, p_from: monthStart, p_to: monthEnd }),
    ]).then(([t, m]) => {
      if (t.data?.ok) setTeamLeaves(t.data.leaves || [])
      if (m.data?.ok) setMyLeaves(m.data.leaves || [])
    })
  }, [lineProfile, tab, calMonth])

  // 把該月每天有誰請假整理出來
  const calMap = useMemo(() => {
    const map = {} // date → [{employee, type, is_me}]
    teamLeaves.forEach(l => {
      const start = new Date(l.start_date)
      const end = new Date(l.end_date)
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        const k = d.toISOString().slice(0, 10)
        if (!map[k]) map[k] = []
        map[k].push(l)
      }
    })
    return map
  }, [teamLeaves])

  if (loading) {
    return <div className="page"><div className="empty"><div className="spinner" style={{ margin: '0 auto' }} /></div></div>
  }

  const monthDates = getMonthDates(calMonth.y, calMonth.m)
  const todayStr = new Date().toISOString().slice(0, 10)

  return (
    <div className="page">
      <button className="back-btn" onClick={() => navigate('/')}><ChevronLeft size={16} /> 首頁</button>
      <div className="header">
        <div className="header-title">📊 假期與額度</div>
      </div>

      {/* Tabs */}
      <div style={{
        display: 'flex', gap: 4, padding: 4, marginBottom: 12,
        borderRadius: 12, background: 'var(--card)', border: '1px solid var(--border)',
      }}>
        {[
          { key: 'balance',  label: '我的額度' },
          { key: 'calendar', label: '請假日曆' },
        ].map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            style={{
              flex: 1, padding: '8px 12px', borderRadius: 8, border: 'none',
              background: tab === t.key ? 'var(--cyan-dim)' : 'transparent',
              color: tab === t.key ? 'var(--cyan)' : 'var(--t2)',
              fontSize: 13, fontWeight: 700, cursor: 'pointer',
            }}
          >{t.label}</button>
        ))}
      </div>

      {/* ============ 額度 tab ============ */}
      {tab === 'balance' && (
        <>
          {/* 年度切換 */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16, marginBottom: 12 }}>
            <button onClick={() => setYear(y => y - 1)} style={{
              width: 32, height: 32, borderRadius: '50%', border: '1px solid var(--border2)',
              background: 'var(--card)', color: 'var(--t2)', cursor: 'pointer',
            }}>‹</button>
            <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--t1)' }}>{year} 年度</div>
            <button onClick={() => setYear(y => y + 1)} style={{
              width: 32, height: 32, borderRadius: '50%', border: '1px solid var(--border2)',
              background: 'var(--card)', color: 'var(--t2)', cursor: 'pointer',
            }}>›</button>
          </div>

          {/* 總覽 */}
          <div style={{
            padding: '16px 18px', marginBottom: 16, borderRadius: 16,
            background: 'linear-gradient(135deg, var(--cyan-dim), var(--green-dim))',
            border: '1px solid rgba(34,211,238,0.3)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-around', textAlign: 'center' }}>
              <div>
                <div style={{ fontSize: 11, color: 'var(--t3)' }}>總可用</div>
                <div style={{ fontSize: 22, fontWeight: 900, color: 'var(--t1)' }}>{Number(totals.total || 0).toFixed(1)}</div>
                <div style={{ fontSize: 10, color: 'var(--t3)' }}>天</div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: 'var(--t3)' }}>已用</div>
                <div style={{ fontSize: 22, fontWeight: 900, color: 'var(--orange)' }}>{Number(totals.used || 0).toFixed(1)}</div>
                <div style={{ fontSize: 10, color: 'var(--t3)' }}>天</div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: 'var(--t3)' }}>剩餘</div>
                <div style={{ fontSize: 22, fontWeight: 900, color: 'var(--green)' }}>{Number(totals.remaining || 0).toFixed(1)}</div>
                <div style={{ fontSize: 10, color: 'var(--t3)' }}>天</div>
              </div>
            </div>
          </div>

          {/* 各假別 */}
          {balances.length === 0 ? (
            <div className="empty">
              <div style={{ fontSize: 48 }}>📭</div>
              <div style={{ fontSize: 13, color: 'var(--t3)', marginTop: 8 }}>{year} 年還沒設定額度</div>
              <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 4 }}>請聯絡 HR 設定</div>
            </div>
          ) : (
            balances.map(b => {
              const remaining = Number(b.remaining || 0)
              const total = Number(b.total_days || 0) + Number(b.carry_over_days || 0)
              const usedPct = total > 0 ? (Number(b.used_days || 0) / total * 100) : 0
              const c = LEAVE_COLOR[b.leave_type] || 'var(--cyan)'
              return (
                <div key={b.leave_type} style={{
                  padding: '14px 16px', marginBottom: 8, borderRadius: 14,
                  background: 'var(--card)', border: '1px solid var(--border)',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--t1)' }}>
                      {LEAVE_LABEL[b.leave_type] || b.leave_type}
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: c }}>
                      {remaining.toFixed(1)} <span style={{ fontSize: 11, color: 'var(--t3)' }}>/ {total.toFixed(1)} 天</span>
                    </div>
                  </div>
                  <div style={{ height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.05)', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${Math.min(100, usedPct)}%`, background: c }} />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: 10, color: 'var(--t3)' }}>
                    <span>已用 {Number(b.used_days || 0).toFixed(1)} 天</span>
                    {Number(b.carry_over_days || 0) > 0 && <span>含轉結 {Number(b.carry_over_days).toFixed(1)} 天</span>}
                  </div>
                  {b.expiring_soon && b.expires_at && (
                    <div style={{
                      marginTop: 8, padding: '6px 10px', borderRadius: 6,
                      background: 'rgba(248,113,113,0.1)', color: 'var(--red)',
                      fontSize: 11, display: 'flex', alignItems: 'center', gap: 4,
                    }}>
                      <AlertCircle size={11} /> {b.expires_at} 到期，請盡快使用
                    </div>
                  )}
                </div>
              )
            })
          )}
        </>
      )}

      {/* ============ 日曆 tab ============ */}
      {tab === 'calendar' && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16, marginBottom: 12 }}>
            <button onClick={() => setCalMonth(m => m.m === 1 ? { y: m.y - 1, m: 12 } : { y: m.y, m: m.m - 1 })} style={{
              width: 32, height: 32, borderRadius: '50%', border: '1px solid var(--border2)',
              background: 'var(--card)', color: 'var(--t2)', cursor: 'pointer',
            }}><ChevronLeft size={16} /></button>
            <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--t1)' }}>
              {calMonth.y} 年 {calMonth.m} 月
            </div>
            <button onClick={() => setCalMonth(m => m.m === 12 ? { y: m.y + 1, m: 1 } : { y: m.y, m: m.m + 1 })} style={{
              width: 32, height: 32, borderRadius: '50%', border: '1px solid var(--border2)',
              background: 'var(--card)', color: 'var(--t2)', cursor: 'pointer',
            }}><ChevronRight size={16} /></button>
          </div>

          {/* 圖例 */}
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', fontSize: 10, color: 'var(--t3)', marginBottom: 8 }}>
            <span><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: 'var(--cyan)', marginRight: 4 }} />我的假</span>
            <span><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: 'var(--purple)', marginRight: 4 }} />同事的假</span>
            <span><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: 'var(--red-dim, rgba(248,113,113,0.3))', marginRight: 4 }} />今天</span>
          </div>

          {/* 日曆 grid */}
          <div style={{
            background: 'var(--card)', borderRadius: 12, padding: 8,
            border: '1px solid var(--border)', marginBottom: 12,
          }}>
            {/* 週標題 */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', textAlign: 'center', fontSize: 10, color: 'var(--t3)', marginBottom: 4 }}>
              {['一', '二', '三', '四', '五', '六', '日'].map((d, i) => (
                <div key={d} style={{ padding: '4px 0', fontWeight: 700, color: i >= 5 ? 'var(--red)' : 'var(--t3)' }}>{d}</div>
              ))}
            </div>
            {/* 日 */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2 }}>
              {monthDates.map((date, idx) => {
                if (!date) return <div key={idx} />
                const leaves = calMap[date] || []
                const hasMine = leaves.some(l => l.is_me)
                const hasOthers = leaves.some(l => !l.is_me)
                const isToday = date === todayStr
                return (
                  <div key={date} style={{
                    aspectRatio: '1', padding: 4, borderRadius: 6,
                    background: isToday ? 'rgba(248,113,113,0.12)' : 'transparent',
                    border: isToday ? '1px solid rgba(248,113,113,0.3)' : '1px solid transparent',
                    display: 'flex', flexDirection: 'column', alignItems: 'center',
                    fontSize: 12, color: 'var(--t1)',
                  }}>
                    <div style={{ fontWeight: isToday ? 800 : 500 }}>{Number(date.slice(8))}</div>
                    <div style={{ display: 'flex', gap: 2, marginTop: 2 }}>
                      {hasMine && <div style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--cyan)' }} />}
                      {hasOthers && <div style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--purple)' }} />}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* 該月明細 */}
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--t2)', margin: '12px 0 8px' }}>
            本月已核准的假（{teamLeaves.length} 筆）
          </div>
          {teamLeaves.length === 0 ? (
            <div className="empty"><div style={{ fontSize: 12, color: 'var(--t3)' }}>本月沒人請假</div></div>
          ) : (
            teamLeaves.map((l, i) => (
              <div key={i} style={{
                padding: '10px 14px', marginBottom: 6, borderRadius: 10,
                background: 'var(--card)', border: '1px solid var(--border)',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: l.is_me ? 'var(--cyan)' : 'var(--t1)' }}>
                    {l.is_me && '👤 '}{l.employee} <span style={{ fontSize: 11, color: 'var(--t3)', fontWeight: 500 }}>· {l.type}</span>
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 2 }}>
                    {l.start_date}{l.start_date !== l.end_date ? ` ~ ${l.end_date}` : ''}
                  </div>
                </div>
                <div style={{ fontSize: 12, color: 'var(--t2)', fontWeight: 700 }}>
                  {Number(l.days || 0).toFixed(1)} 天
                </div>
              </div>
            ))
          )}

          {/* 我的本月狀態 */}
          {myLeaves.length > 0 && (
            <>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--t2)', margin: '16px 0 8px' }}>
                我本月的請假紀錄
              </div>
              {myLeaves.map(l => {
                const st = STATUS_STYLE[l.status] || STATUS_STYLE['待審核']
                return (
                  <div key={l.id} style={{
                    padding: '10px 14px', marginBottom: 6, borderRadius: 10,
                    background: 'var(--card)', border: '1px solid var(--border)',
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--t1)' }}>
                        {l.type} · {Number(l.days || 0).toFixed(1)} 天
                      </div>
                      <span style={{
                        fontSize: 11, padding: '3px 8px', borderRadius: 999,
                        background: st.bg, color: st.color, fontWeight: 700,
                      }}>{l.status}</span>
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 4 }}>
                      {l.start_date}{l.start_date !== l.end_date ? ` ~ ${l.end_date}` : ''}
                    </div>
                    {l.reject_reason && (
                      <div style={{ fontSize: 11, color: 'var(--red)', marginTop: 4 }}>
                        駁回原因：{l.reject_reason}
                      </div>
                    )}
                  </div>
                )
              })}
            </>
          )}
        </>
      )}
    </div>
  )
}
