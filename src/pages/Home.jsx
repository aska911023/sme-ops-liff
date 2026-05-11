import { useState, useEffect, useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'

// Init theme
const savedTheme = localStorage.getItem('liff-theme')
if (savedTheme) document.documentElement.setAttribute('data-theme', savedTheme)

// ── 角色 ──
const MANAGER_ROLES = ['manager', 'admin', 'super_admin']
const isManagerRole = (r) => MANAGER_ROLES.includes(r)

// ── 常用 quick action (3 個大按鈕) ──
const STAFF_QUICK = [
  { path: '/clock', icon: '⏰', label: '打卡', color: 'var(--cyan)', dim: 'var(--cyan-dim)' },
  { path: '/tasks', icon: '📋', label: '我的任務', color: 'var(--purple)', dim: 'rgba(167,139,250,0.15)' },
  { path: '/leave', icon: '🏖️', label: '請假', color: 'var(--blue)', dim: 'var(--blue-dim)' },
]
const MANAGER_QUICK = [
  { path: '/approve', icon: '✅', label: '審核中心', color: 'var(--green)', dim: 'var(--green-dim)' },
  { path: '/tasks', icon: '📋', label: '我的任務', color: 'var(--purple)', dim: 'rgba(167,139,250,0.15)' },
  { path: '/dashboard', icon: '📊', label: '流程進度', color: 'var(--cyan)', dim: 'var(--cyan-dim)' },
]

// ── 更多功能（折疊區） ──
const MORE_STAFF = [
  { path: '/my-schedule', icon: '📅', label: '我的班表', color: 'var(--blue)', dim: 'var(--blue-dim)' },
  { path: '/off-request', icon: '🗓️', label: '排休申請', color: 'var(--cyan)', dim: 'var(--cyan-dim)' },
  { path: '/overtime', icon: '🕐', label: '加班申請', color: 'var(--orange)', dim: 'rgba(251,146,60,0.15)' },
  { path: '/clock-correction', icon: '🔧', label: '補打卡', color: 'var(--purple)', dim: 'rgba(167,139,250,0.15)' },
  { path: '/business-trip', icon: '✈️', label: '出差申請', color: 'var(--blue)', dim: 'var(--blue-dim)' },
  { path: '/expense-request', icon: '🧾', label: '費用申請', color: 'var(--yellow)', dim: 'rgba(251,191,36,0.15)' },
  { path: '/expenses', icon: '💸', label: '報帳', color: 'var(--yellow)', dim: 'rgba(251,191,36,0.15)' },
  { path: '/salary', icon: '💰', label: '查薪水', color: 'var(--green)', dim: 'var(--green-dim)' },
  { path: '/approval-status', icon: '🛡️', label: '簽核狀態', color: 'var(--purple)', dim: 'rgba(167,139,250,0.15)' },
  { path: '/inventory', icon: '📦', label: '查庫存', color: 'var(--orange)', dim: 'var(--orange-dim)' },
]
const MORE_MANAGER = [
  { path: '/clock', icon: '⏰', label: '打卡', color: 'var(--cyan)', dim: 'var(--cyan-dim)' },
  { path: '/my-schedule', icon: '📅', label: '我的班表', color: 'var(--blue)', dim: 'var(--blue-dim)' },
  { path: '/leave', icon: '🏖️', label: '我請假', color: 'var(--blue)', dim: 'var(--blue-dim)' },
  { path: '/off-request', icon: '🗓️', label: '排休申請', color: 'var(--cyan)', dim: 'var(--cyan-dim)' },
  { path: '/overtime', icon: '🕐', label: '加班', color: 'var(--orange)', dim: 'rgba(251,146,60,0.15)' },
  { path: '/clock-correction', icon: '🔧', label: '補打卡', color: 'var(--purple)', dim: 'rgba(167,139,250,0.15)' },
  { path: '/business-trip', icon: '✈️', label: '出差', color: 'var(--blue)', dim: 'var(--blue-dim)' },
  { path: '/expense-request', icon: '🧾', label: '費用申請', color: 'var(--yellow)', dim: 'rgba(251,191,36,0.15)' },
  { path: '/salary', icon: '💰', label: '查薪水', color: 'var(--green)', dim: 'var(--green-dim)' },
  { path: '/approval-status', icon: '🛡️', label: '簽核狀態', color: 'var(--purple)', dim: 'rgba(167,139,250,0.15)' },
  { path: '/inventory', icon: '📦', label: '查庫存', color: 'var(--orange)', dim: 'var(--orange-dim)' },
]

// ── CTA 卡（「該做的事」） ──
function CTACard({ tone, title, subtitle, ctaLabel, onClick, badge }) {
  const colorMap = {
    danger:  { bg: 'rgba(239,68,68,0.08)',  border: 'rgba(239,68,68,0.25)',  accent: '#ef4444' },
    warn:    { bg: 'rgba(245,158,11,0.08)', border: 'rgba(245,158,11,0.25)', accent: 'var(--orange)' },
    info:    { bg: 'rgba(34,211,238,0.08)', border: 'rgba(34,211,238,0.25)', accent: 'var(--cyan)' },
    success: { bg: 'rgba(34,197,94,0.08)',  border: 'rgba(34,197,94,0.25)',  accent: 'var(--green)' },
    purple:  { bg: 'rgba(167,139,250,0.08)', border: 'rgba(167,139,250,0.25)', accent: 'var(--purple)' },
  }
  const c = colorMap[tone] || colorMap.info
  return (
    <div onClick={onClick} style={{
      background: c.bg, border: `1px solid ${c.border}`, borderRadius: 16,
      padding: 14, cursor: onClick ? 'pointer' : 'default',
      display: 'flex', alignItems: 'center', gap: 12,
      transition: 'transform 0.15s',
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--t1)', marginBottom: 4 }}>{title}</div>
        {subtitle && <div style={{ fontSize: 12, color: 'var(--t3)', lineHeight: 1.4 }}>{subtitle}</div>}
      </div>
      {badge && (
        <span style={{
          fontSize: 10, fontWeight: 800, padding: '3px 8px', borderRadius: 6,
          background: 'rgba(239,68,68,0.15)', color: '#ef4444', flexShrink: 0,
        }}>{badge}</span>
      )}
      {ctaLabel && ctaLabel !== '—' && (
        <div style={{
          flexShrink: 0, padding: '8px 14px', borderRadius: 10,
          background: c.accent, color: '#fff', fontSize: 13, fontWeight: 700,
        }}>
          {ctaLabel} →
        </div>
      )}
    </div>
  )
}

// ── 大按鈕 menu item ──
function BigMenuItem({ item, badge }) {
  return (
    <Link to={item.path} className="menu-item" style={{ position: 'relative', overflow: 'hidden' }}>
      <div style={{
        position: 'absolute', top: -15, right: -15, width: 40, height: 40,
        borderRadius: '50%', background: item.dim, pointerEvents: 'none', opacity: 0.5,
      }} />
      <div className="menu-icon" style={{
        background: item.dim,
        border: `1.5px solid ${item.color}25`,
        boxShadow: `0 2px 8px ${item.color}10`,
      }}>
        {item.icon}
      </div>
      <div className="menu-label">{item.label}</div>
      {badge != null && badge > 0 && (
        <span style={{
          position: 'absolute', top: 6, right: 6,
          minWidth: 18, height: 18, padding: '0 5px', borderRadius: 9,
          background: '#ef4444', color: '#fff',
          fontSize: 10, fontWeight: 800,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>{badge}</span>
      )}
    </Link>
  )
}

export default function Home() {
  const { employee, lineProfile } = useAuth()
  const navigate = useNavigate()
  const isManager = isManagerRole(employee?.role)
  const [theme, setTheme] = useState(() => localStorage.getItem('liff-theme') || 'dark')
  const [todayAttendance, setTodayAttendance] = useState(null)
  const [myTasks, setMyTasks] = useState([])
  const [pendingApprovals, setPendingApprovals] = useState(null)  // 主管才會 load
  const [showMore, setShowMore] = useState(false)

  const hour = new Date().getHours()
  const greeting = hour < 12 ? '早安' : hour < 18 ? '午安' : '晚安'
  const today = new Date()
  const dateStr = today.toLocaleDateString('zh-TW', { month: 'long', day: 'numeric', weekday: 'long' })

  useEffect(() => {
    if (!lineProfile?.lineUserId) return
    supabase.rpc('liff_get_attendance_today', { p_line_user_id: lineProfile.lineUserId })
      .then(({ data }) => setTodayAttendance(data || null))
    supabase.rpc('liff_list_my_tasks', { p_line_user_id: lineProfile.lineUserId, p_scope: 'active' })
      .then(({ data }) => setMyTasks(Array.isArray(data) ? data : []))
    if (isManager) {
      supabase.rpc('liff_list_pending_approvals', { p_line_user_id: lineProfile.lineUserId })
        .then(({ data }) => setPendingApprovals(data || null))
    }
  }, [lineProfile, isManager])

  // ── 待簽核總數 + 逾期數（主管用） ──
  const pendingStats = useMemo(() => {
    if (!pendingApprovals) return null
    const lists = ['leaves', 'overtimes', 'trips', 'corrections', 'expense_requests', 'shift_swaps_for_manager', 'off_requests']
    let total = 0, overdue = 0
    const todayStr = new Date().toISOString().slice(0, 10)
    for (const k of lists) {
      const arr = pendingApprovals[k] || []
      total += arr.length
      for (const r of arr) {
        const created = r.created_at?.slice(0, 10)
        if (!created) continue
        const days = Math.round((new Date(todayStr) - new Date(created)) / 86400000)
        if (days >= 3) overdue++
      }
    }
    return { total, overdue }
  }, [pendingApprovals])

  // ── 下一個任務 ──
  const nextTask = useMemo(() => {
    if (!myTasks.length) return null
    const sorted = [...myTasks].sort((a, b) => {
      const dueA = a.due_date || '9999-12-31'
      const dueB = b.due_date || '9999-12-31'
      return dueA.localeCompare(dueB)
    })
    return sorted[0]
  }, [myTasks])

  // ── 打卡狀態 ──
  const clockState = useMemo(() => {
    if (!todayAttendance) return { kind: 'unclocked', label: '尚未打卡' }
    if (todayAttendance.clock_out) return { kind: 'done', label: '已下班', time: todayAttendance.clock_out?.slice(0, 5) }
    if (todayAttendance.clock_in) return { kind: 'in', label: '上班中', time: todayAttendance.clock_in?.slice(0, 5) }
    return { kind: 'unclocked', label: '尚未打卡' }
  }, [todayAttendance])

  const quickActions = isManager ? MANAGER_QUICK : STAFF_QUICK
  const moreItems = isManager ? MORE_MANAGER : MORE_STAFF

  // 都好的 case（沒 CTA 要顯示）
  const allDone =
    clockState.kind === 'done' &&
    (!isManager || !pendingStats?.total) &&
    !nextTask

  return (
    <div className="page">
      {/* ── Profile Card ── */}
      <div style={{
        background: 'linear-gradient(135deg, rgba(34,211,238,0.08) 0%, rgba(59,130,246,0.08) 50%, rgba(167,139,250,0.08) 100%)',
        border: '1px solid rgba(34,211,238,0.15)',
        borderRadius: 20, padding: '18px',
        marginBottom: 16,
        position: 'relative', overflow: 'hidden',
      }}>
        <div style={{
          position: 'absolute', top: -30, right: -30, width: 100, height: 100,
          borderRadius: '50%', background: 'rgba(34,211,238,0.06)', pointerEvents: 'none',
        }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, position: 'relative', zIndex: 1 }}>
          {lineProfile?.pictureUrl ? (
            <img className="avatar" src={lineProfile.pictureUrl} alt=""
              style={{ width: 52, height: 52, border: '2.5px solid rgba(34,211,238,0.3)' }}
            />
          ) : (
            <div className="avatar" style={{
              width: 52, height: 52,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'var(--cyan-dim)', fontSize: 22, fontWeight: 800, color: 'var(--cyan)',
              border: '2.5px solid rgba(34,211,238,0.3)',
            }}>
              {employee?.name?.charAt(0) || '?'}
            </div>
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 18, fontWeight: 800 }}>{greeting}，{employee?.name}</div>
            <div style={{ fontSize: 12, color: 'var(--t3)', marginTop: 3, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <span>{employee?.dept || ''}{employee?.position ? ` · ${employee.position}` : ''}</span>
              {isManager && (
                <span style={{
                  padding: '1px 6px', borderRadius: 4,
                  background: 'rgba(34,197,94,0.15)', color: 'var(--green)',
                  fontSize: 10, fontWeight: 700,
                }}>主管</span>
              )}
            </div>
            <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 2 }}>{dateStr}</div>
          </div>
        </div>
      </div>

      {/* ── 該做的事 (CTA cards) ── */}
      <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--t1)', marginBottom: 10 }}>
        ⚡ 你現在該做的事
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 22 }}>
        {/* 打卡狀態 */}
        {clockState.kind === 'unclocked' && (
          <CTACard
            tone="warn"
            title="🔴 還沒打卡"
            subtitle="點擊立即打卡"
            ctaLabel="打卡"
            onClick={() => navigate('/clock')}
          />
        )}
        {clockState.kind === 'in' && (
          <CTACard
            tone="info"
            title="✅ 上班中"
            subtitle={`上班 ${clockState.time}，下班時別忘了打卡`}
            ctaLabel="下班"
            onClick={() => navigate('/clock')}
          />
        )}

        {/* 主管：待簽 */}
        {isManager && pendingStats?.total > 0 && (
          <CTACard
            tone="purple"
            title={`📝 待簽 ${pendingStats.total} 筆`}
            subtitle={pendingStats.overdue > 0
              ? `其中 ${pendingStats.overdue} 件已超過 3 天`
              : '請盡快處理'}
            ctaLabel="去簽"
            badge={pendingStats.overdue > 0 ? `${pendingStats.overdue} 逾期` : null}
            onClick={() => navigate('/approve')}
          />
        )}

        {/* 下一個任務 */}
        {nextTask && (
          <CTACard
            tone="info"
            title={`📋 ${nextTask.title || '待辦任務'}`}
            subtitle={
              nextTask.due_date
                ? `截止 ${nextTask.due_date.slice(5)}${myTasks.length > 1 ? ` · 共 ${myTasks.length} 件待辦` : ''}`
                : `共 ${myTasks.length} 件待辦`
            }
            ctaLabel="處理"
            onClick={() => navigate('/tasks')}
          />
        )}

        {/* 全部都好 */}
        {allDone && (
          <CTACard
            tone="success"
            title="🎉 今日無待辦"
            subtitle="享受工作以外的時光！"
            ctaLabel="—"
          />
        )}
      </div>

      {/* ── 常用 3 大按鈕 ── */}
      <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--t1)', marginBottom: 10 }}>
        {isManager ? '主管功能' : '常用'}
      </div>
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: 10,
        marginBottom: 22,
      }}>
        {quickActions.map(item => {
          let badge = null
          if (isManager && item.path === '/approve' && pendingStats?.total) badge = pendingStats.total
          if (item.path === '/tasks' && myTasks.length) badge = myTasks.length
          return <BigMenuItem key={item.path} item={item} badge={badge} />
        })}
      </div>

      {/* ── 更多功能 (折疊) ── */}
      <div
        onClick={() => setShowMore(s => !s)}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '10px 14px', borderRadius: 12,
          background: 'var(--card)', border: '1px solid var(--border)',
          cursor: 'pointer', marginBottom: 12,
        }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--t1)' }}>
          更多功能 <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--t3)', marginLeft: 4 }}>({moreItems.length})</span>
        </div>
        <div style={{
          fontSize: 14, color: 'var(--t3)',
          transform: showMore ? 'rotate(180deg)' : 'none',
          transition: 'transform 0.2s',
        }}>▾</div>
      </div>
      {showMore && (
        <div className="menu-grid" style={{ marginBottom: 12 }}>
          {moreItems.map(item => <BigMenuItem key={item.path} item={item} />)}
        </div>
      )}

      {/* ── Brand Footer ── */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        marginTop: 28, paddingTop: 20,
        borderTop: '1px solid var(--border)',
      }}>
        <div style={{
          width: 22, height: 22, borderRadius: 7,
          background: 'linear-gradient(135deg, var(--cyan), var(--blue))',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 10, fontWeight: 800, color: '#fff',
        }}>S</div>
        <span style={{ fontSize: 11, color: 'var(--t3)', fontWeight: 600 }}>SME OPS</span>
      </div>

      {/* ── Theme Toggle ── */}
      <div
        onClick={() => {
          const next = theme === 'light' ? 'dark' : 'light'
          document.documentElement.setAttribute('data-theme', next)
          localStorage.setItem('liff-theme', next)
          setTheme(next)
        }}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          marginTop: 12, padding: '10px', borderRadius: 12,
          background: 'var(--card)', border: '1px solid var(--border)',
          cursor: 'pointer', fontSize: 12, fontWeight: 600, color: 'var(--t3)',
        }}
      >
        {theme === 'light' ? '🌙' : '☀️'}
        <span>{theme === 'light' ? '深色模式' : '淺色模式'}</span>
      </div>
    </div>
  )
}
