import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

// Init theme
const savedTheme = localStorage.getItem('liff-theme')
if (savedTheme) document.documentElement.setAttribute('data-theme', savedTheme)

const MENUS = [
  { path: '/clock', icon: '⏰', label: '打卡', color: 'var(--cyan)', dim: 'var(--cyan-dim)' },
  { path: '/salary', icon: '💰', label: '查薪水', color: 'var(--green)', dim: 'var(--green-dim)' },
  { path: '/leave', icon: '📋', label: '請假', color: 'var(--blue)', dim: 'var(--blue-dim)' },
  { path: '/inventory', icon: '📦', label: '查庫存', color: 'var(--orange)', dim: 'var(--orange-dim)' },
  { path: '/tasks', icon: '⚙️', label: '流程回報', color: 'var(--purple)', dim: 'var(--purple-dim)' },
  { path: '/expenses', icon: '🧾', label: '報帳', color: 'var(--yellow)', dim: 'rgba(251,191,36,0.15)' },
  { path: '/off-request', icon: '📅', label: '排休申請', color: 'var(--yellow)', dim: 'rgba(251,191,36,0.15)' },
  { path: '/customer/new', icon: '🤝', label: '新增客戶', color: 'var(--pink)', dim: 'rgba(244,114,182,0.15)' },
]

export default function Home() {
  const { employee, lineProfile } = useAuth()
  const [theme, setTheme] = useState(() => localStorage.getItem('liff-theme') || 'dark')
  const hour = new Date().getHours()
  const greeting = hour < 12 ? '早安' : hour < 18 ? '午安' : '晚安'

  return (
    <div className="page">
      {/* Profile */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 24, padding: '8px 0' }}>
        {lineProfile?.pictureUrl ? (
          <img className="avatar" src={lineProfile.pictureUrl} alt="" />
        ) : (
          <div className="avatar" style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'var(--cyan-dim)', fontSize: 20, fontWeight: 800, color: 'var(--cyan)',
          }}>
            {employee?.name?.charAt(0) || '?'}
          </div>
        )}
        <div>
          <div style={{ fontSize: 17, fontWeight: 700 }}>{greeting}，{employee?.name}</div>
          <div style={{ fontSize: 12, color: 'var(--t3)', marginTop: 2 }}>
            {employee?.department || ''} {employee?.position ? `· ${employee.position}` : ''}
          </div>
        </div>
      </div>

      {/* Quick Action: Clock */}
      <Link to="/clock" style={{ textDecoration: 'none' }}>
        <div style={{
          background: 'linear-gradient(135deg, rgba(34,211,238,0.12), rgba(59,130,246,0.12))',
          border: '1px solid rgba(34,211,238,0.2)',
          borderRadius: 16, padding: '20px 20px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          marginBottom: 20,
        }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--t1)' }}>快速打卡</div>
            <div style={{ fontSize: 12, color: 'var(--t2)', marginTop: 4 }}>
              {new Date().toLocaleDateString('zh-TW', { weekday: 'long', month: 'long', day: 'numeric' })}
            </div>
          </div>
          <div style={{ fontSize: 28 }}>👆</div>
        </div>
      </Link>

      {/* Menu Grid */}
      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--t2)', marginBottom: 12 }}>功能選單</div>
      <div className="menu-grid">
        {MENUS.map(m => (
          <Link key={m.path} to={m.path} className="menu-item">
            <div className="menu-icon" style={{ background: m.dim, border: `1px solid ${m.color}30` }}>
              {m.icon}
            </div>
            <div className="menu-label">{m.label}</div>
          </Link>
        ))}
      </div>

      {/* Theme Toggle */}
      <div
        onClick={() => {
          const next = theme === 'light' ? 'dark' : 'light'
          document.documentElement.setAttribute('data-theme', next)
          localStorage.setItem('liff-theme', next)
          setTheme(next)
        }}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          marginTop: 20, padding: '12px', borderRadius: 12,
          background: 'var(--card)', border: '1px solid var(--border)',
          cursor: 'pointer', fontSize: 13, fontWeight: 600, color: 'var(--t2)',
        }}
      >
        {theme === 'light' ? '🌙' : '☀️'}
        <span>{theme === 'light' ? '深色模式' : '淺色模式'}</span>
      </div>
    </div>
  )
}
