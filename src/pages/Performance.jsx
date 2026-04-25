import { useState, useEffect } from 'react'
import { ChevronLeft, Target, Award, Plus, Minus } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'

const RATING_COLOR = {
  'S':  { bg: 'rgba(167,139,250,0.18)', color: 'var(--purple)' },
  'A+': { bg: 'var(--green-dim)',       color: 'var(--green)' },
  'A':  { bg: 'var(--green-dim)',       color: 'var(--green)' },
  'B+': { bg: 'var(--cyan-dim)',        color: 'var(--cyan)' },
  'B':  { bg: 'var(--cyan-dim)',        color: 'var(--cyan)' },
  'B-': { bg: 'rgba(251,146,60,0.15)',  color: 'var(--orange)' },
  'C':  { bg: 'rgba(248,113,113,0.15)', color: 'var(--red)' },
}

const STATUS_STYLE = {
  '進行中': { bg: 'var(--cyan-dim)',  color: 'var(--cyan)' },
  '已完成': { bg: 'var(--green-dim)', color: 'var(--green)' },
}

export default function Performance() {
  const { lineProfile } = useAuth()
  const navigate = useNavigate()
  const [tab, setTab] = useState('goals') // 'goals' | 'reviews'
  const [reviews, setReviews] = useState([])
  const [latest, setLatest] = useState(null)
  const [goals, setGoals] = useState([])
  const [summary, setSummary] = useState({ total: 0, in_progress: 0, completed: 0, avg_progress: 0 })
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(null)

  const reload = async () => {
    if (!lineProfile?.lineUserId) return
    setLoading(true)
    const [r, g] = await Promise.all([
      supabase.rpc('liff_list_my_reviews', { p_line_user_id: lineProfile.lineUserId }),
      supabase.rpc('liff_list_my_goals', { p_line_user_id: lineProfile.lineUserId }),
    ])
    if (r.data?.ok) {
      setReviews(r.data.reviews || [])
      setLatest(r.data.latest || null)
    }
    if (g.data?.ok) {
      setGoals(g.data.goals || [])
      setSummary(g.data.summary || summary)
    }
    setLoading(false)
  }

  useEffect(() => { reload() }, [lineProfile])

  const updateProgress = async (goal, delta) => {
    const next = Math.max(0, Math.min(100, Number(goal.progress || 0) + delta))
    setBusy(goal.id)
    const { data } = await supabase.rpc('liff_update_goal_progress', {
      p_line_user_id: lineProfile.lineUserId,
      p_goal_id: goal.id,
      p_progress: next,
    })
    if (data?.ok) {
      setGoals(prev => prev.map(g => g.id === goal.id ? { ...g, progress: data.progress, status: data.status } : g))
      // 重抓 summary
      const s = await supabase.rpc('liff_list_my_goals', { p_line_user_id: lineProfile.lineUserId })
      if (s.data?.ok) setSummary(s.data.summary)
    } else {
      alert(data?.error === 'CANNOT_UPDATE' ? '此目標無法更新進度' : '更新失敗')
    }
    setBusy(null)
  }

  if (loading) {
    return <div className="page"><div className="empty"><div className="spinner" style={{ margin: '0 auto' }} /></div></div>
  }

  return (
    <div className="page">
      <button className="back-btn" onClick={() => navigate('/')}><ChevronLeft size={16} /> 首頁</button>
      <div className="header">
        <div className="header-title">📈 我的績效</div>
      </div>

      {/* 最新成績 */}
      {latest && (
        <div style={{
          padding: '16px 18px', marginBottom: 16, borderRadius: 16,
          background: 'linear-gradient(135deg, var(--cyan-dim), rgba(167,139,250,0.12))',
          border: '1px solid rgba(34,211,238,0.3)',
        }}>
          <div style={{ fontSize: 11, color: 'var(--t3)', fontWeight: 600 }}>最新考核</div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 }}>
            <div>
              <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--t1)' }}>{latest.period}</div>
              <div style={{ fontSize: 12, color: 'var(--t3)', marginTop: 2 }}>
                考核人：{latest.reviewer || '—'}
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 32, fontWeight: 900, color: 'var(--cyan)', lineHeight: 1 }}>
                {latest.overall_score ?? '—'}
                <span style={{ fontSize: 13, color: 'var(--t3)', marginLeft: 4 }}>分</span>
              </div>
              {latest.rating && (
                <div style={{
                  display: 'inline-block', marginTop: 6,
                  fontSize: 12, padding: '3px 10px', borderRadius: 999, fontWeight: 800,
                  background: RATING_COLOR[latest.rating]?.bg || 'var(--card)',
                  color: RATING_COLOR[latest.rating]?.color || 'var(--t2)',
                }}>
                  {latest.rating}
                </div>
              )}
            </div>
          </div>
          {latest.goals != null && latest.goals_completed != null && (
            <div style={{ marginTop: 10, fontSize: 12, color: 'var(--t2)' }}>
              目標達成 <b style={{ color: 'var(--green)' }}>{latest.goals_completed}</b> / {latest.goals}
            </div>
          )}
        </div>
      )}

      {/* 統計 */}
      <div className="stat-row" style={{ marginBottom: 16 }}>
        <div className="stat-box">
          <div className="stat-num" style={{ color: 'var(--cyan)' }}>{summary.in_progress}</div>
          <div className="stat-label">進行中</div>
        </div>
        <div className="stat-box">
          <div className="stat-num" style={{ color: 'var(--green)' }}>{summary.completed}</div>
          <div className="stat-label">已完成</div>
        </div>
        <div className="stat-box">
          <div className="stat-num" style={{ color: 'var(--purple)' }}>{summary.avg_progress}%</div>
          <div className="stat-label">平均進度</div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{
        display: 'flex', gap: 4, padding: 4, marginBottom: 12,
        borderRadius: 12, background: 'var(--card)', border: '1px solid var(--border)',
      }}>
        {[
          { key: 'goals',   label: '我的目標', count: goals.length },
          { key: 'reviews', label: '考核紀錄', count: reviews.length },
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
          >
            {t.label} <span style={{ fontSize: 11, opacity: 0.7 }}>({t.count})</span>
          </button>
        ))}
      </div>

      {/* 目標清單 */}
      {tab === 'goals' && (
        goals.length === 0 ? (
          <div className="empty">
            <div style={{ fontSize: 48 }}>🎯</div>
            <div style={{ fontSize: 13, color: 'var(--t3)', marginTop: 8 }}>還沒有設定目標</div>
            <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 4 }}>請主管在主系統幫你建立</div>
          </div>
        ) : (
          goals.map(g => {
            const st = STATUS_STYLE[g.status] || STATUS_STYLE['進行中']
            const pct = Number(g.progress || 0)
            const canEdit = g.status === '進行中' || g.status === '已完成'
            return (
              <div key={g.id} style={{
                padding: '14px 16px', marginBottom: 8, borderRadius: 14,
                background: 'var(--card)', border: '1px solid var(--border)',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--t1)' }}>
                      <Target size={14} style={{ display: 'inline', marginRight: 4, color: 'var(--cyan)' }} />
                      {g.title || '（未命名目標）'}
                    </div>
                    {g.target && (
                      <div style={{ fontSize: 12, color: 'var(--t3)', marginTop: 4 }}>目標：{g.target}</div>
                    )}
                  </div>
                  <span style={{
                    fontSize: 11, padding: '3px 10px', borderRadius: 999,
                    background: st.bg, color: st.color, fontWeight: 700, flexShrink: 0,
                  }}>{g.status}</span>
                </div>

                {/* 進度條 */}
                <div style={{ marginTop: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ fontSize: 11, color: 'var(--t3)' }}>進度</span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: pct >= 100 ? 'var(--green)' : 'var(--cyan)' }}>
                      {pct}%
                    </span>
                  </div>
                  <div style={{ height: 8, borderRadius: 4, background: 'var(--bg-secondary, rgba(255,255,255,0.05))', overflow: 'hidden' }}>
                    <div style={{
                      height: '100%', width: `${Math.min(100, pct)}%`,
                      background: pct >= 100 ? 'var(--green)' : 'var(--cyan)',
                      transition: 'width 0.3s ease',
                    }} />
                  </div>
                </div>

                {/* 加減按鈕 */}
                {canEdit && (
                  <div style={{ display: 'flex', gap: 6, marginTop: 10, justifyContent: 'flex-end' }}>
                    {[-10, -5, +5, +10].map(d => (
                      <button
                        key={d}
                        onClick={() => updateProgress(g, d)}
                        disabled={busy === g.id || (d < 0 && pct === 0) || (d > 0 && pct >= 100)}
                        style={{
                          padding: '6px 10px', borderRadius: 8,
                          background: d > 0 ? 'var(--cyan-dim)' : 'var(--card)',
                          color: d > 0 ? 'var(--cyan)' : 'var(--t2)',
                          border: '1px solid var(--border2)',
                          fontSize: 11, fontWeight: 700, cursor: 'pointer',
                          opacity: (busy === g.id || (d < 0 && pct === 0) || (d > 0 && pct >= 100)) ? 0.4 : 1,
                          display: 'flex', alignItems: 'center', gap: 2,
                        }}
                      >
                        {d > 0 ? <Plus size={10} /> : <Minus size={10} />}{Math.abs(d)}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )
          })
        )
      )}

      {/* 考核紀錄 */}
      {tab === 'reviews' && (
        reviews.length === 0 ? (
          <div className="empty">
            <div style={{ fontSize: 48 }}>📋</div>
            <div style={{ fontSize: 13, color: 'var(--t3)', marginTop: 8 }}>還沒有考核紀錄</div>
          </div>
        ) : (
          reviews.map(r => {
            const rc = RATING_COLOR[r.rating] || { bg: 'var(--card)', color: 'var(--t2)' }
            return (
              <div key={r.id} style={{
                padding: '14px 16px', marginBottom: 8, borderRadius: 14,
                background: 'var(--card)', border: '1px solid var(--border)',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--t1)' }}>
                      <Award size={14} style={{ display: 'inline', marginRight: 4, color: 'var(--purple)' }} />
                      {r.period}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 2 }}>
                      {r.reviewer ? `考核人：${r.reviewer}` : ''} {r.status && `· ${r.status}`}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 22, fontWeight: 900, color: 'var(--t1)', lineHeight: 1 }}>
                      {r.overall_score ?? '—'}
                    </div>
                    {r.rating && (
                      <span style={{
                        fontSize: 10, padding: '2px 8px', borderRadius: 999, fontWeight: 800,
                        background: rc.bg, color: rc.color,
                      }}>{r.rating}</span>
                    )}
                  </div>
                </div>
                {r.goals != null && r.goals > 0 && (
                  <div style={{ fontSize: 12, color: 'var(--t2)' }}>
                    目標達成 {r.goals_completed || 0} / {r.goals}
                  </div>
                )}
              </div>
            )
          })
        )
      )}
    </div>
  )
}
