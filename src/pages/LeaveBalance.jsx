import { useState, useEffect, useMemo } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { computeAllBalances, parseBenefitExtras, LEAVE_INFO } from '../lib/leaveBalanceCalc'

const STATUS_STYLE = {
  '待審核': { bg: 'rgba(251,146,60,0.15)', color: 'var(--orange)' },
  '已核准': { bg: 'var(--green-dim)',     color: 'var(--green)' },
  '已拒絕': { bg: 'rgba(248,113,113,0.15)', color: 'var(--red)' },
  '已退回': { bg: 'rgba(248,113,113,0.15)', color: 'var(--red)' },
  '已駁回': { bg: 'rgba(248,113,113,0.15)', color: 'var(--red)' },
  '已取消': { bg: 'rgba(148,163,184,0.15)', color: 'var(--text-secondary)' },
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
  const { lineProfile, employee: ctxEmployee } = useAuth()
  const navigate = useNavigate()
  const [tab, setTab] = useState('balance') // 'balance' | 'calendar'

  const today = new Date()
  const [year, setYear] = useState(today.getFullYear())
  const [calMonth, setCalMonth] = useState({ y: today.getFullYear(), m: today.getMonth() + 1 })

  const [balances, setBalances] = useState([])
  const [totals, setTotals] = useState({ total: 0, used: 0, remaining: 0 })
  const [teamLeaves, setTeamLeaves] = useState([])
  const [myLeaves, setMyLeaves] = useState([])
  const [compBalance, setCompBalance] = useState(null)
  const [loading, setLoading] = useState(true)

  const employee = ctxEmployee

  useEffect(() => {
    if (!lineProfile?.lineUserId) return
    setLoading(true)
    // 跟 Leave.jsx 同一套：用 employee.join_date + leave_requests + benefit_policies client-side 算
    Promise.all([
      supabase.rpc('liff_list_leave_requests', { p_line_user_id: lineProfile.lineUserId }),
      supabase.rpc('liff_list_benefit_policies', { p_line_user_id: lineProfile.lineUserId }),
      supabase.rpc('liff_get_my_comp_time_balance', { p_line_user_id: lineProfile.lineUserId }),
      supabase.rpc('liff_get_my_leave_balances', { p_line_user_id: lineProfile.lineUserId, p_year: year }),
      // 特休額度單一真相 = §38 RPC(帶選的年度週年期,對齊 web LeaveBalances)
      supabase.rpc('liff_leave_annual_entitlement', { p_line_user_id: lineProfile.lineUserId, p_ref_year: year }),
    ]).then(([reqRes, polRes, ctRes, lbRes, entRes]) => {
      // 補休餘額
      if (ctRes.data?.ok) {
        setCompBalance({
          total_remaining: Number(ctRes.data.total_remaining || 0),
          ledgers: ctRes.data.ledgers || [],
        })
      }
      const reqs = Array.isArray(reqRes.data) ? reqRes.data : []
      const policies = Array.isArray(polRes.data) ? polRes.data : []
      const benefitExtras = parseBenefitExtras(policies)
      const dbBalances = Array.isArray(lbRes.data) ? lbRes.data : []
      const all = computeAllBalances({
        joinDate: ctxEmployee?.join_date,
        leaveRequests: reqs,
        benefitExtras,
        calendarYear: year,
        isPartTime: ctxEmployee?.salary_type === 'hourly',
        weeklyHours: Number(ctxEmployee?.weekly_hours) || 0,
        dbBalances,
        annualEnt: entRes?.data || null,
        gender: ctxEmployee?.gender,
      })
      setBalances(all)
      const total = all.reduce((s, b) => s + (b.total || 0), 0)
      const used = all.reduce((s, b) => s + (b.used || 0), 0)
      setTotals({ total, used, remaining: total - used })
      setLoading(false)
    }).catch(err => {
      console.error('load balances failed', err)
      setLoading(false)
    })
  }, [lineProfile, ctxEmployee, year])

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
                <div style={{ fontSize: 10, color: 'var(--t3)' }}>小時</div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: 'var(--t3)' }}>已用</div>
                <div style={{ fontSize: 22, fontWeight: 900, color: 'var(--orange)' }}>{Number(totals.used || 0).toFixed(1)}</div>
                <div style={{ fontSize: 10, color: 'var(--t3)' }}>小時</div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: 'var(--t3)' }}>剩餘</div>
                <div style={{ fontSize: 22, fontWeight: 900, color: 'var(--green)' }}>{Number(totals.remaining || 0).toFixed(1)}</div>
                <div style={{ fontSize: 10, color: 'var(--t3)' }}>小時</div>
              </div>
            </div>
          </div>

          {/* 補休餘額 — 加班選補休累積，FIFO 扣，過期月結自動兌換加班費 */}
          {compBalance && compBalance.total_remaining > 0 && (
            <div style={{
              padding: '14px 16px', marginBottom: 12, borderRadius: 14,
              background: 'rgba(167,139,250,0.10)', border: '1px solid rgba(167,139,250,0.25)',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--t1)' }}>🕐 補休</div>
                  <div style={{ fontSize: 10, color: 'var(--t3)', marginTop: 2 }}>加班累積 · FIFO 扣最早到期</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 22, fontWeight: 900, color: '#a78bfa' }}>{compBalance.total_remaining}</div>
                  <div style={{ fontSize: 10, color: 'var(--t3)' }}>小時</div>
                </div>
              </div>
              {compBalance.ledgers.length > 0 && (
                <div style={{ fontSize: 11, color: 'var(--t3)', lineHeight: 1.6, paddingTop: 8, borderTop: '1px dashed rgba(167,139,250,0.25)' }}>
                  {compBalance.ledgers.slice(0, 5).map(l => (
                    <div key={l.ledger_id} style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span>{l.ot_date} → 剩 {Number(l.hours_remaining).toFixed(1)}h</span>
                      <span style={{ color: l.days_to_expire <= 30 ? 'var(--orange)' : 'var(--t3)' }}>
                        {l.expires_at} 到期
                        {l.days_to_expire <= 30 && ` (${l.days_to_expire}天)`}
                      </span>
                    </div>
                  ))}
                  {compBalance.ledgers.length > 5 && (
                    <div style={{ marginTop: 4, fontStyle: 'italic' }}>… 另有 {compBalance.ledgers.length - 5} 筆</div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* 各假別 — 跟 Leave.jsx 假期餘額同步 */}
          {balances.length === 0 ? (
            <div className="empty">
              <div style={{ fontSize: 48 }}>📭</div>
              <div style={{ fontSize: 13, color: 'var(--t3)', marginTop: 8 }}>找不到員工資料或還沒到職</div>
            </div>
          ) : (
            balances.map(b => {
              const remaining = (b.total || 0) - (b.used || 0)
              const total = b.total || 0
              const usedPct = total > 0 ? ((b.used || 0) / total * 100) : 0
              const info = LEAVE_INFO[b.label]
              const isAnnual = b.label === '特休'
              const c = remaining <= 0 ? 'var(--red)' : isAnnual ? 'var(--cyan)' : 'var(--green)'
              return (
                <div key={b.label} style={{
                  padding: '14px 16px', marginBottom: 8, borderRadius: 14,
                  background: 'var(--card)', border: '1px solid var(--border)',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--t1)' }}>
                      {b.label}
                      {info && (
                        <span style={{ fontSize: 10, color: 'var(--t3)', fontWeight: 400, marginLeft: 6 }}>
                          {info.paid} · {info.law}
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: c }}>
                      剩 {Math.round(remaining * 10) / 10}{' '}
                      <span style={{ fontSize: 11, color: 'var(--t3)' }}>/ {total} {b.isHours ? '小時' : '天'}</span>
                      {b.extra > 0 && <span style={{ color: 'var(--cyan)', fontSize: 10, marginLeft: 4 }}>(+{b.extra})</span>}
                    </div>
                  </div>
                  <div style={{ height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.05)', overflow: 'hidden', marginTop: 4 }}>
                    <div style={{ height: '100%', width: `${Math.min(100, usedPct)}%`, background: c }} />
                  </div>
                  {(b.pending || 0) > 0 && (
                    <div style={{ fontSize: 10, color: 'var(--orange)', marginTop: 4 }}>
                      簽核中 {Math.round((b.pending || 0) * 10) / 10} {b.isHours ? '小時' : '天'} · 可申請 {Math.max(0, Math.round((remaining - (b.pending || 0)) * 10) / 10)} {b.isHours ? '小時' : '天'}
                    </div>
                  )}
                  {info?.note && (
                    <div style={{ fontSize: 10, color: 'var(--t3)', marginTop: 4 }}>{info.note}</div>
                  )}
                </div>
              )
            })
          )}

          {/* 年資 + 特休週期 footer */}
          {employee?.join_date && (() => {
            const yrs = Math.round((new Date() - new Date(employee.join_date)) / (365.25 * 86400000) * 10) / 10
            const join = new Date(employee.join_date)
            const now = new Date()
            const thisAnniv = new Date(now.getFullYear(), join.getMonth(), join.getDate())
            const annualStart = thisAnniv > now
              ? new Date(now.getFullYear() - 1, join.getMonth(), join.getDate())
              : thisAnniv
            const annualEnd = new Date(annualStart)
            annualEnd.setFullYear(annualEnd.getFullYear() + 1)
            annualEnd.setDate(annualEnd.getDate() - 1)
            return (
              <div style={{ marginTop: 12, padding: '10px 14px', borderRadius: 10, background: 'var(--card)', fontSize: 11, color: 'var(--t3)' }}>
                <div>年資 {yrs} 年</div>
                <div style={{ marginTop: 2 }}>
                  特休週期：{annualStart.toLocaleDateString('zh-TW')} ~ {annualEnd.toLocaleDateString('zh-TW')}
                  <span style={{ marginLeft: 6 }}>｜其他假別：{year} 年度</span>
                </div>
              </div>
            )
          })()}
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
