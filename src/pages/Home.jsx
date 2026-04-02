import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'

// Init theme
const savedTheme = localStorage.getItem('liff-theme')
if (savedTheme) document.documentElement.setAttribute('data-theme', savedTheme)

const MENUS = [
  { path: '/clock', icon: '⏰', label: '打卡', color: 'var(--cyan)', dim: 'var(--cyan-dim)', desc: '上下班打卡' },
  { path: '/salary', icon: '💰', label: '查薪水', color: 'var(--green)', dim: 'var(--green-dim)', desc: '本月薪資' },
  { path: '/leave', icon: '📋', label: '請假', color: 'var(--blue)', dim: 'var(--blue-dim)', desc: '假單申請' },
  { path: '/inventory', icon: '📦', label: '查庫存', color: 'var(--orange)', dim: 'var(--orange-dim)', desc: '即時庫存' },
  { path: '/tasks', icon: '⚙️', label: '流程回報', color: 'var(--purple)', dim: 'var(--purple-dim)', desc: '任務進度' },
  { path: '/expenses', icon: '🧾', label: '報帳', color: 'var(--yellow)', dim: 'rgba(251,191,36,0.15)', desc: '費用報銷' },
  { path: '/off-request', icon: '📅', label: '排休申請', color: 'var(--cyan)', dim: 'var(--cyan-dim)', desc: '排休選日' },
  { path: '/customer/new', icon: '🤝', label: '新增客戶', color: 'var(--pink)', dim: 'rgba(244,114,182,0.15)', desc: '客戶建檔' },
]

export default function Home() {
  const { employee, lineProfile } = useAuth()
  const [theme, setTheme] = useState(() => localStorage.getItem('liff-theme') || 'dark')
  const [todayAttendance, setTodayAttendance] = useState(null)
  const [pendingTasks, setPendingTasks] = useState(0)

  const hour = new Date().getHours()
  const greeting = hour < 12 ? '早安' : hour < 18 ? '午安' : '晚安'
  const today = new Date()
  const dateStr = today.toLocaleDateString('zh-TW', { month: 'long', day: 'numeric', weekday: 'long' })

  useEffect(() => {
    if (!employee) return
    const todayISO = today.toISOString().slice(0, 10)

    supabase
      .from('attendance_records')
      .select('clock_in, clock_out')
      .eq('employee', employee.name)
      .eq('date', todayISO)
      .maybeSingle()
      .then(({ data }) => setTodayAttendance(data))

    supabase
      .from('tasks')
      .select('id', { count: 'exact', head: true })
      .eq('assignee', employee.name)
      .in('status', ['未開始', '進行中'])
      .then(({ count }) => setPendingTasks(count || 0))
  }, [employee])

  const clockStatus = todayAttendance
    ? todayAttendance.clock_out ? '已下班' : '已上班'
    : '尚未打卡'
  const clockStatusColor = todayAttendance
    ? todayAttendance.clock_out ? 'var(--green)' : 'var(--cyan)'
    : 'var(--orange)'

  return (
    <div className="page">
      {/* ── Profile Card ── */}
      <div style={{
        background: 'linear-gradient(135deg, rgba(34,211,238,0.08) 0%, rgba(59,130,246,0.08) 50%, rgba(167,139,250,0.08) 100%)',
        border: '1px solid rgba(34,211,238,0.15)',
        borderRadius: 20, padding: '20px',
        marginBottom: 20,
        position: 'relative', overflow: 'hidden',
      }}>
        {/* Decorative orb */}
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
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 18, fontWeight: 800 }}>{greeting}，{employee?.name}</div>
            <div style={{ fontSize: 12, color: 'var(--t3)', marginTop: 3 }}>
              {employee?.department || ''}{employee?.position ? ` · ${employee.position}` : ''}
            </div>
            <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 2 }}>{dateStr}</div>
          </div>
        </div>

        {/* Quick status bar */}
        <div style={{
          display: 'flex', gap: 8, marginTop: 16, position: 'relative', zIndex: 1,
        }}>
          <div style={{
            flex: 1, padding: '10px 12px', borderRadius: 12,
            background: 'var(--card)', border: '1px solid var(--border)',
            display: 'flex', alignItems: 'center', gap: 8,
          }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: clockStatusColor, flexShrink: 0 }} />
            <div>
              <div style={{ fontSize: 10, color: 'var(--t3)', fontWeight: 600 }}>出勤</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: clockStatusColor }}>{clockStatus}</div>
            </div>
          </div>
          <div style={{
            flex: 1, padding: '10px 12px', borderRadius: 12,
            background: 'var(--card)', border: '1px solid var(--border)',
            display: 'flex', alignItems: 'center', gap: 8,
          }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: pendingTasks > 0 ? 'var(--orange)' : 'var(--green)', flexShrink: 0 }} />
            <div>
              <div style={{ fontSize: 10, color: 'var(--t3)', fontWeight: 600 }}>待辦</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: pendingTasks > 0 ? 'var(--orange)' : 'var(--green)' }}>
                {pendingTasks} 項任務
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Quick Clock Action ── */}
      <Link to="/clock" style={{ textDecoration: 'none' }}>
        <div style={{
          background: todayAttendance && !todayAttendance.clock_out
            ? 'linear-gradient(135deg, rgba(251,146,60,0.15), rgba(248,113,113,0.15))'
            : 'linear-gradient(135deg, rgba(34,211,238,0.12), rgba(59,130,246,0.12))',
          border: `1px solid ${todayAttendance && !todayAttendance.clock_out ? 'rgba(251,146,60,0.25)' : 'rgba(34,211,238,0.2)'}`,
          borderRadius: 16, padding: '18px 20px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          marginBottom: 24,
        }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--t1)' }}>
              {todayAttendance && !todayAttendance.clock_out ? '點我下班打卡' : '快速打卡'}
            </div>
            <div style={{ fontSize: 12, color: 'var(--t2)', marginTop: 3 }}>
              {todayAttendance?.clock_in
                ? `上班 ${todayAttendance.clock_in}${todayAttendance.clock_out ? ` → 下班 ${todayAttendance.clock_out}` : ''}`
                : '今日尚未打卡'
              }
            </div>
          </div>
          <div style={{
            width: 48, height: 48, borderRadius: 14,
            background: todayAttendance && !todayAttendance.clock_out
              ? 'linear-gradient(135deg, var(--orange), var(--red))'
              : 'linear-gradient(135deg, var(--cyan), var(--blue))',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 22, boxShadow: '0 4px 16px rgba(34,211,238,0.2)',
          }}>
            {todayAttendance && !todayAttendance.clock_out ? '👋' : '👆'}
          </div>
        </div>
      </Link>

      {/* ── Menu Grid ── */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 14,
      }}>
        <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--t1)' }}>功能選單</div>
        <div style={{ fontSize: 11, color: 'var(--t3)' }}>{MENUS.length} 項功能</div>
      </div>

      <div className="menu-grid">
        {MENUS.map(m => (
          <Link key={m.path} to={m.path} className="menu-item" style={{ position: 'relative', overflow: 'hidden' }}>
            <div style={{
              position: 'absolute', top: -15, right: -15, width: 40, height: 40,
              borderRadius: '50%', background: m.dim, pointerEvents: 'none', opacity: 0.5,
            }} />
            <div className="menu-icon" style={{
              background: m.dim,
              border: `1.5px solid ${m.color}25`,
              boxShadow: `0 2px 8px ${m.color}10`,
            }}>
              {m.icon}
            </div>
            <div className="menu-label">{m.label}</div>
          </Link>
        ))}
      </div>

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
